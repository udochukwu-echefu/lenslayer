"""Synthetic ASGI transport and fake async model; never resolves provider keys."""
import asyncio
from datetime import timedelta
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import delete, event, func, select

from backend.app.api import qa_stream, review, governance
from backend.app.config import Settings
from backend.app.database import Database
from backend.app.document_intelligence import build_review_workflow
from backend.app.document_intelligence.adapters import PortfolioEvidenceQuestionAnswerer, RetainedTextQuestionAnswerer
from backend.app.document_intelligence.qa import QATimings, count_async_attempt, current_timings
from backend.app.models import Contract, ContractReview, Membership, Organization, PlatformAuditEvent, User, utcnow
from backend.app.object_storage import LocalObjectStore
from backend.app.services import PlatformService
from backend.app.service_domains.qa import PORTFOLIO_CANDIDATES, portfolio_documents


class FakeModel:
    def __init__(self):
        self.release = asyncio.Event()
        self.closed = asyncio.Event()
        self.failure = False
        self.first = "Renewal is annual [Source 1]. "
        self.calls = 0

    def invoke(self, prompt):
        return SimpleNamespace(content="Renewal is annual [Source 1].", response_metadata={})

    async def astream(self, prompt):
        self.calls += 1
        try:
            await count_async_attempt(None)
            yield SimpleNamespace(content=self.first, response_metadata={})
            await self.release.wait()
            if self.failure:
                raise RuntimeError("DO_NOT_LOG_PRIVATE_PROVIDER_EXCEPTION")
            yield SimpleNamespace(content="Confirm the notice period.", response_metadata={"token_usage": {"queue_time": 0.003}})
        finally:
            self.closed.set()


class Exchange:
    """Actual ASGI send/receive, not httpx's deliberately buffered ASGI transport."""
    def __init__(self, app, path, subject="qa-user"):
        self.sent = asyncio.Queue()
        self.incoming = asyncio.Queue()
        self.incoming.put_nowait({"type": "http.request", "body": b'{"question":"Renewal notice?"}', "more_body": False})
        scope = {"type": "http", "asgi": {"version": "3.0", "spec_version": "2.3"}, "http_version": "1.1",
                 "method": "POST", "scheme": "http", "path": path, "raw_path": path.encode(), "query_string": b"",
                 "headers": [(b"content-type", b"application/json"), (b"x-lenslayer-user", subject.encode())],
                 "client": ("127.0.0.1", 1), "server": ("synthetic", 80)}
        self.task = asyncio.create_task(app(scope, self.incoming.get, self.sent.put))
        self.frames = []

    async def next(self):
        message = await asyncio.wait_for(self.sent.get(), 5)
        if message["type"] == "http.response.start":
            self.headers = dict(message["headers"])
            self.status = message["status"]
            return await self.next()
        body = message.get("body", b"")
        if not body:
            return None
        value = json.loads(body)
        self.frames.append(value)
        return value

    async def until(self, type):
        while (frame := await self.next()) is not None:
            if frame.get("type") == type:
                return frame
        raise AssertionError(f"Missing {type}")

    async def disconnect(self):
        await self.incoming.put({"type": "http.disconnect"})
        await asyncio.wait_for(self.task, 5)

    async def finish(self):
        result = await self.until("final")
        await asyncio.wait_for(self.task, 5)
        return result


class QAStreamingTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.settings = Settings(database_url=f"sqlite:///{self.temp.name}/qa.db", auth_mode="local")
        self.db = Database(self.settings)
        self.db.create_schema()
        self.store = LocalObjectStore(Path(self.temp.name) / "objects")
        self.model = FakeModel()
        self.workflow = build_review_workflow()
        self.workflow._contract_qa = RetainedTextQuestionAnswerer(lambda: self.model, lambda: True)
        self.workflow._portfolio_qa = PortfolioEvidenceQuestionAnswerer(lambda: self.model, lambda: True)
        self.app = FastAPI()
        self.app.state.database, self.app.state.settings = self.db, self.settings
        self.app.state.object_store, self.app.state.review_workflow = self.store, self.workflow
        for router in (qa_stream.router, review.router, governance.router):
            self.app.include_router(router, prefix="/api/v1")
        with self.db.session_factory() as session:
            session.add_all([User(id="u", external_subject="qa-user"), User(id="other", external_subject="other-user"),
                             Organization(id="org", name="Synthetic", slug="synthetic"),
                             Organization(id="other-org", name="Other", slug="other")])
            session.flush()
            session.add(Membership(id="m", user_id="u", organization_id="org", role="viewer"))
            session.add(Contract(id="c", organization_id="org", created_by_user_id="u", title="Renewal", source_name="fake.txt",
                                 retain_source_text=True, status="ready", expires_at=utcnow() + timedelta(days=1)))
            session.flush()
            session.add(ContractReview(id="r", organization_id="org", contract_id="c", source_text="[PAGE 2]\nRenewal notice is sixty days.", analysis_json='{"summary":"Renewal report"}'))
            session.commit()
        self.path = "/api/v1/organizations/org/contracts/c/questions/stream"

    def tearDown(self):
        self.db.dispose()
        self.temp.cleanup()

    def audits(self):
        with self.db.session_factory() as session:
            return list(session.scalars(select(PlatformAuditEvent).where(PlatformAuditEvent.action.like("%.question_answered"))))

    async def test_content_arrives_before_provider_finishes_final_citations_and_audit(self):
        with self.assertLogs("backend.app.document_intelligence.qa", level="INFO") as logs:
            exchange = Exchange(self.app, self.path)
            first = await exchange.until("answer")
            self.assertTrue(first["provisional"])
            self.assertFalse(self.model.release.is_set())
            self.assertFalse(exchange.task.done())
            self.assertEqual(self.audits(), [])
            self.model.release.set()
            final = await exchange.finish()
        self.assertTrue(final["completed"])
        self.assertFalse(final["provisional"])
        self.assertIn("[Source 1]", final["result"]["answer"])
        self.assertEqual(final["result"]["sources"][0]["location"], "Page 2")
        self.assertEqual({frame["request_id"] for frame in exchange.frames}, {final["request_id"]})
        self.assertEqual([f["seq"] for f in exchange.frames], list(range(1, len(exchange.frames) + 1)))
        self.assertEqual(exchange.headers[b"cache-control"], b"private, no-store")
        self.assertEqual(exchange.headers[b"x-accel-buffering"], b"no")
        self.assertEqual(len(self.audits()), 1)
        self.assertNotIn("question", json.loads(self.audits()[0].detail_json))
        self.assertEqual(final["timings"]["retry_count"], 0)
        self.assertEqual(final["timings"]["queue_ms"], 3)
        self.assertLess(final["timings"]["first_content_ms"], final["timings"]["total_ms"])
        self.assertNotIn("Renewal", str(logs.records[0].__dict__))

    async def test_disconnect_cancels_provider_and_never_audits_partial(self):
        exchange = Exchange(self.app, self.path)
        await exchange.until("answer")
        await exchange.disconnect()
        await asyncio.wait_for(self.model.closed.wait(), 2)
        self.assertFalse(self.model.release.is_set())
        self.assertEqual(self.audits(), [])
        self.assertFalse(any(f["type"] == "final" for f in exchange.frames))

    async def test_failure_after_headers_is_safe_terminal_incomplete_no_replay(self):
        self.model.failure = True
        exchange = Exchange(self.app, self.path)
        await exchange.until("answer")
        self.model.release.set()
        final = await exchange.finish()
        self.assertFalse(final["completed"])
        self.assertNotIn("result", final)
        self.assertNotIn("DO_NOT_LOG", json.dumps(exchange.frames))
        self.assertEqual(self.model.calls, 1)
        self.assertEqual(self.audits(), [])

    async def test_timeout_closes_provider_and_no_final_audit(self):
        with patch.object(qa_stream, "STREAM_TIMEOUT_SECONDS", 0.1):
            exchange = Exchange(self.app, self.path)
            final = await exchange.finish()
        self.assertFalse(final["completed"])
        self.assertTrue(self.model.closed.is_set())
        self.assertEqual(self.audits(), [])
        self.assertEqual(next(f for f in exchange.frames if f["type"] == "error")["code"], "timeout")

    async def test_missing_or_invalid_citation_cannot_complete(self):
        for content in ("Unsupported answer", "Wrong [Source 99]"):
            with self.subTest(content=content):
                self.model.first = content
                self.model.release.set()
                final = await Exchange(self.app, self.path).finish()
                self.assertFalse(final["completed"])
        self.assertEqual(self.audits(), [])

    async def test_expiry_revocation_deletion_or_source_change_before_final_blocks_completion(self):
        for change in ("expiry", "revocation", "deletion", "text"):
            with self.subTest(change=change):
                # Restore between cases, each request has its own fake stream gate.
                self.setUp_case()
                exchange = Exchange(self.app, self.path)
                await exchange.until("answer")
                with self.db.session_factory() as session:
                    if change == "expiry":
                        session.get(Contract, "c").expires_at = utcnow() - timedelta(seconds=1)
                    elif change == "revocation":
                        session.execute(delete(Membership))
                    elif change == "deletion":
                        session.execute(delete(ContractReview))
                    else:
                        session.get(ContractReview, "r").source_text = "Replacement"
                    session.commit()
                self.model.release.set()
                final = await exchange.finish()
                self.assertFalse(final["completed"])
                self.assertEqual(self.audits(), [])

    def setUp_case(self):
        with self.db.session_factory() as session:
            if not session.get(Membership, "m"):
                session.add(Membership(id="m", user_id="u", organization_id="org", role="viewer"))
            if not session.get(ContractReview, "r"):
                session.add(ContractReview(id="r", contract_id="c", organization_id="org"))
            session.get(ContractReview, "r").source_text = "Renewal notice is sixty days."
            session.get(Contract, "c").expires_at = utcnow() + timedelta(days=1)
            session.commit()
        self.model.release = asyncio.Event()

    async def test_revalidates_identity_expiry_before_final(self):
        from backend.app.security import Principal
        calls = 0
        def principal(request):
            nonlocal calls
            calls += 1
            if calls >= 3:
                raise HTTPException(401, "Expired")
            return Principal("qa-user", "", "")
        with patch.object(qa_stream, "resolve_principal", principal):
            exchange = Exchange(self.app, self.path)
            await exchange.until("answer")
            self.model.release.set()
            final = await exchange.finish()
        self.assertFalse(final["completed"])
        self.assertEqual(self.audits(), [])

    async def test_cross_tenant_denied_before_private_events_or_provider(self):
        exchange = Exchange(self.app, self.path, subject="other-user")
        body = await exchange.next()
        await exchange.task
        self.assertEqual(exchange.status, 403)
        self.assertNotIn("Renewal", json.dumps(body))
        self.assertEqual(self.model.calls, 0)

    async def test_portfolio_stream_provenance_and_existing_json_callers(self):
        self.model.release.set()
        final = await Exchange(self.app, "/api/v1/organizations/org/portfolio/questions/stream").finish()
        self.assertTrue(final["completed"])
        self.assertEqual(final["result"]["sources"][0]["contract_id"], "c")
        self.assertIn("Retained source r", final["result"]["sources"][0]["location"])
        # Complete JSON endpoints retain the same schema and are not NDJSON.
        with TestClient(self.app) as client:
            for path in (self.path.removesuffix("/stream"), "/api/v1/organizations/org/portfolio/questions"):
                response = client.post(path, json={"question": "Renewal notice?"}, headers={"x-lenslayer-user": "qa-user"})
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(set(response.json()), {"answer", "sources", "generated_by"})

    async def test_retrieval_loads_at_most_24_ranked_candidates_not_newest_window(self):
        with self.db.session_factory() as session:
            for index in range(1000):
                id = f"new-{index:04}"
                session.add(Contract(id=id, organization_id="org", created_by_user_id="u", title="Ordinary", source_name="fake",
                                     retain_source_text=True))
                session.add(ContractReview(id=f"r-{id}", organization_id="org", contract_id=id, source_text="Ordinary text."))
            session.get(Contract, "c").created_at = utcnow() - timedelta(days=3650)
            session.add(Contract(id="foreign", organization_id="other-org", created_by_user_id="other", title="Renewal notice", source_name="fake", retain_source_text=True))
            session.add(ContractReview(id="foreign-r", organization_id="other-org", contract_id="foreign", source_text="FOREIGN Renewal notice"))
            session.commit()
            service = PlatformService(session, self.settings, self.store, self.workflow)
            user = session.get(User, "u")
            selects = []
            def capture(conn, cursor, statement, parameters, context, executemany):
                if statement.lstrip().upper().startswith("SELECT"):
                    selects.append(statement)
            event.listen(self.db.engine, "before_cursor_execute", capture)
            try:
                documents = portfolio_documents(service, "org", user, "Renewal notice?")
                self.assertEqual([d.contract_id for d in documents], ["c"])
                self.assertTrue(any("LIMIT" in sql and "ORDER BY" in sql for sql in selects))
                # A broad token matches all 1001; only 24 full texts cross SQL boundary.
                documents = portfolio_documents(service, "org", user, "text notice")
                self.assertLessEqual(len(documents), PORTFOLIO_CANDIDATES)
                self.assertLessEqual(len(selects), 6)
                self.assertNotIn("FOREIGN", str(documents))
            finally:
                event.remove(self.db.engine, "before_cursor_execute", capture)

    async def test_expired_unretained_and_deleted_text_never_used_even_if_row_remains(self):
        for change in ("expiry", "unretained", "deleted"):
            with self.subTest(change=change), self.db.session_factory() as session:
                contract, report = session.get(Contract, "c"), session.get(ContractReview, "r")
                contract.retain_source_text = change != "unretained"
                contract.expires_at = utcnow() + timedelta(days=1) if change != "expiry" else utcnow() - timedelta(days=1)
                report.source_text = "PRIVATE_EXTRACTED renewal" if change != "deleted" else None
                report.analysis_json = '{"summary":"Renewal review only"}'
                session.commit()
                documents = portfolio_documents(PlatformService(session, self.settings, self.store, self.workflow), "org", session.get(User, "u"), "renewal")
                self.assertEqual(len(documents), 1)
                self.assertNotIn("PRIVATE_EXTRACTED", documents[0].text)
                self.assertIn("Structured review r", documents[0].evidence_kind)

    async def test_retry_measurements_are_content_free_and_request_local(self):
        timing = QATimings()
        token = current_timings.set(timing)
        try:
            await count_async_attempt(None)
            await count_async_attempt(None)
            self.assertEqual(timing.values()["retry_count"], 1)
        finally:
            current_timings.reset(token)
        self.assertIsNone(current_timings.get())


if __name__ == "__main__":
    unittest.main()
