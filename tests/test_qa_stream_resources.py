"""Returning identities, real engine checkouts and whole-stream SQL, fake model only."""
import asyncio
import hashlib
import unittest
from unittest.mock import patch

import httpx
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from backend.app.api import qa_stream
from backend.app.api.dependencies import ServiceDep, UserDep
from backend.app.models import Contract, ContractReview, User
from tests.test_qa_streaming import QAStreamingTests, Exchange
from tests import test_qa_streaming as fixtures
from tests.postgres_support import DisposablePostgres, postgres_enabled


class StreamResourceTests(QAStreamingTests):
    def setUp(self):
        super().setUp()
        with self.db.session_factory() as session:
            user = session.get(User, "u")
            user.display_name, user.email = "Local user", ""
            session.commit()
        # Real two-connection QueuePool, no overflow. No mocked Session.close().
        self.db.engine.dispose()
        self.db.engine = create_engine(self.settings.database_url,
            **({"connect_args": {"check_same_thread": False}} if self.settings.database_url.startswith("sqlite") else {}),
            pool_size=2, max_overflow=0, pool_timeout=1)
        if self.settings.database_url.startswith("sqlite"):
            @event.listens_for(self.db.engine, "connect")
            def fingerprint(connection, _record):
                connection.create_function("ll_sha256", 1, lambda value: hashlib.sha256((value or "").encode()).hexdigest(), deterministic=True)
        self.db.session_factory = sessionmaker(bind=self.db.engine, expire_on_commit=False)

        @self.app.get("/synthetic/auth-read")
        def read(service: ServiceDep, user: UserDep):
            service.workspace.membership("org", user)
            return {"ok": True}

    async def test_concurrent_paused_streams_release_auth_checkouts_and_allow_reads(self):
        baseline = self.db.engine.pool.checkedout()
        exchanges = []
        try:
            for _ in range(6):
                exchange = Exchange(self.app, self.path)
                exchanges.append(exchange)
                await exchange.until("answer")
                self.assertEqual(self.db.engine.pool.checkedout(), baseline)
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://synthetic") as client:
                response = await asyncio.wait_for(client.get("/synthetic/auth-read", headers={"x-lenslayer-user": "qa-user"}), 2)
                self.assertEqual(response.status_code, 200)
            self.model.release.set()
            for exchange in exchanges:
                self.assertTrue((await exchange.finish())["completed"])
            self.assertEqual(self.db.engine.pool.checkedout(), baseline)
        finally:
            for exchange in exchanges:
                if not exchange.task.done():
                    await exchange.disconnect()

    async def test_pool_returns_to_baseline_after_failure_timeout_and_disconnect(self):
        for outcome in ("failure", "timeout", "disconnect"):
            self.model.release = asyncio.Event()
            self.model.failure = outcome == "failure"
            with patch.object(qa_stream, "STREAM_TIMEOUT_SECONDS", 0.2 if outcome == "timeout" else 120):
                exchange = Exchange(self.app, self.path)
                await exchange.until("answer")
                self.assertEqual(self.db.engine.pool.checkedout(), 0)
                if outcome == "disconnect":
                    await exchange.disconnect()
                else:
                    if outcome == "failure":
                        self.model.release.set()
                    self.assertFalse((await exchange.finish())["completed"])
                self.assertEqual(self.db.engine.pool.checkedout(), 0)

    async def test_rank_once_then_hash_only_used_evidence_on_heartbeats_and_final(self):
        with self.db.session_factory() as session:
            for index in range(150):
                key = f"unrelated-{index:03}"
                session.add(Contract(id=key, organization_id="org", created_by_user_id="u", title="Renewal", source_name="fake", retain_source_text=True))
                session.add(ContractReview(id=f"r-{key}", contract_id=key, organization_id="org", source_text="Renewal notice. " * 500))
            session.commit()
        sql, materialized, checked = [], [], []
        original, revalidate = qa_stream.portfolio_documents, qa_stream.revalidate_portfolio
        def ranking(*args):
            documents = original(*args)
            materialized.append(len(documents))
            return documents
        def check(*args):
            checked.append(set(args[2]))
            return revalidate(*args)
        def capture(_conn, _cursor, statement, *_args):
            if statement.lstrip().startswith("SELECT"):
                sql.append(statement)
        event.listen(self.db.engine, "before_cursor_execute", capture)
        try:
            with patch.object(qa_stream, "portfolio_documents", ranking), patch.object(qa_stream, "revalidate_portfolio", check), patch.object(qa_stream, "HEARTBEAT_SECONDS", 0.02):
                exchange = Exchange(self.app, "/api/v1/organizations/org/portfolio/questions/stream")
                await exchange.until("answer")
                for _ in range(3):
                    await exchange.until("status")
                # Changing a document outside prepared evidence must not search
                # again or change which excerpts this answer is grounded in.
                unused = next(f"unrelated-{i:03}" for i in range(150) if f"unrelated-{i:03}" not in checked[0])
                with self.db.session_factory() as session:
                    session.get(ContractReview, f"r-{unused}").source_text = "Replacement unrelated text"
                    session.commit()
                self.model.release.set()
                self.assertTrue((await exchange.finish())["completed"])
            self.assertEqual(materialized, [24])
            self.assertGreaterEqual(len(checked), 5)
            self.assertTrue(all(ids == checked[0] and len(ids) <= 8 for ids in checked))
            rank_sql = [s for s in sql if "ORDER BY" in s and "CASE WHEN" in s and "platform_contracts" in s]
            self.assertEqual(len(rank_sql), 1)
            hashes = [s for s in sql if "sha256" in s]
            self.assertEqual(len(hashes), len(checked))
            self.assertTrue(all(" IN (" in s and "ORDER BY" not in s for s in hashes))
        finally:
            event.remove(self.db.engine, "before_cursor_execute", capture)

    async def test_in_place_used_portfolio_source_change_blocks_final(self):
        exchange = Exchange(self.app, "/api/v1/organizations/org/portfolio/questions/stream")
        await exchange.until("answer")
        with self.db.session_factory() as session:
            session.get(ContractReview, "r").source_text = "In-place replacement with no timestamp change"
            session.commit()
        self.model.release.set()
        self.assertFalse((await exchange.finish())["completed"])
        self.assertEqual(self.audits(), [])


@unittest.skipUnless(postgres_enabled(), "Disposable PostgreSQL not opted in")
class PostgresStreamResourceTests(StreamResourceTests):
    def setUp(self):
        pg = DisposablePostgres()
        self.addCleanup(pg.close)
        original = fixtures.Settings
        def settings(**kwargs):
            kwargs["database_url"] = pg.url
            return original(**kwargs)
        self.enterContext(patch.object(fixtures, "Settings", settings))
        super().setUp()
