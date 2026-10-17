"""Synthetic, synchronized ASGI requests; no provider, scanner or worker calls."""
import asyncio
import tempfile
import threading
import unittest
from concurrent.futures import CancelledError as WorkerCancelledError
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

import anyio
import httpx
from fastapi import HTTPException
from starlette.requests import Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from backend.app.application import create_app
from backend.app.api.uploads import run_upload
from backend.app.config import Settings
from backend.app.models import Contract, ContractVersion, DocumentAsset, ProcessingJob
from backend.app.services import PlatformService


class Gate:
    """Waits have only a deadlock watchdog, not a performance threshold."""

    def __init__(self, target=1):
        self.entered = threading.Event()
        self.release = threading.Event()
        self.lock = threading.Lock()
        self.calls = 0
        self.target = target

    def __call__(self, *_args, **_kwargs):
        with self.lock:
            self.calls += 1
            if self.calls >= self.target:
                self.entered.set()
        if not self.release.wait(5):
            raise AssertionError("Blocking adapter was not released by the test")

    async def wait(self):
        if not await anyio.to_thread.run_sync(self.entered.wait, 3):
            raise AssertionError("The upload never reached the blocking adapter")


class UploadConcurrencyTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        root = Path(self.tempdir.name)
        self.settings = Settings(
            _env_file=None, environment="test", auth_mode="local",
            database_url=f"sqlite:///{root / 'uploads.db'}",
            object_storage_root=root / "objects", auto_create_schema=True,
            upload_concurrency=2,
        )
        self.app = create_app(self.settings)
        self.lifespan = self.app.router.lifespan_context(self.app)
        await self.lifespan.__aenter__()
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=self.app, raise_app_exceptions=False),
            base_url="http://test",
        )
        self.headers = {"X-LensLayer-User": "alice", "X-LensLayer-Email": "alice@example.test"}
        response = await self.client.post(
            "/api/v1/organizations", headers=self.headers,
            json={"name": "Synthetic workspace", "slug": "synthetic"},
        )
        self.assertEqual(response.status_code, 201, response.text)
        self.organization_id = response.json()["id"]
        self.base = f"/api/v1/organizations/{self.organization_id}"
        self.store = self.app.state.object_store

    async def asyncTearDown(self):
        await self.client.aclose()
        await self.lifespan.__aexit__(None, None, None)
        self.tempdir.cleanup()

    async def upload(self, path=None, *, headers=None, data=None, content=b"Synthetic agreement", filename="agreement.txt"):
        return await self.client.post(
            path or f"{self.base}/contracts", headers=headers or self.headers,
            data=data or {}, files={"file": (filename, content, "text/plain")},
        )

    async def read_while_blocked(self, task, gate):
        self.assertFalse(gate.release.is_set())
        self.assertFalse(task.done(), "Upload completed before the overlapping read")
        # A real authenticated, tenant-scoped database read, not just a ping.
        with anyio.fail_after(1):
            response = await self.client.get(f"{self.base}/contracts", headers=self.headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertFalse(gate.release.is_set())
        self.assertFalse(task.done())
        return response.json()

    @contextmanager
    def owned_sessions(self):
        """Assert creation, all SQL/flush/commit/rollback and close stay in one thread."""
        sessions = []
        event_loop_thread = threading.get_ident()

        class OwnedSession(Session):
            def __init__(inner, *args, **kwargs):
                super().__init__(*args, **kwargs)
                inner.owner = threading.get_ident()
                inner.closed_by_test = False
                inner.identity_calls = 0
                sessions.append(inner)
                self.assertNotEqual(inner.owner, event_loop_thread)
                self.assertLessEqual(
                    sum(not session.closed_by_test for session in sessions),
                    self.settings.upload_concurrency,
                )

            def check(inner):
                self.assertEqual(threading.get_ident(), inner.owner)

            def _execute_internal(inner, *args, **kwargs):
                inner.check()
                return super()._execute_internal(*args, **kwargs)

            def flush(inner, *args, **kwargs):
                inner.check()
                return super().flush(*args, **kwargs)

            def commit(inner):
                inner.check()
                return super().commit()

            def rollback(inner):
                inner.check()
                return super().rollback()

            def close(inner):
                inner.check()
                super().close()
                inner.closed_by_test = True

        original_identity = PlatformService.ensure_user

        def identity(service, principal):
            service.session.check()
            service.session.identity_calls += 1
            return original_identity(service, principal)

        factory = sessionmaker(
            bind=self.app.state.database.engine, expire_on_commit=False, class_=OwnedSession,
        )
        with patch.object(self.app.state.database, "session_factory", factory), patch.object(
            PlatformService, "ensure_user", identity,
        ):
            yield sessions
        self.assertTrue(all(session.closed_by_test for session in sessions))

    async def test_all_upload_routes_allow_reads_during_scan_and_storage(self):
        original = await self.upload(data={"retain_document": "true", "retain_source_text": "true"})
        self.assertEqual(original.status_code, 202, original.text)
        contract_id = original.json()["contract"]["id"]
        key = await self.client.post(
            f"{self.base}/api-keys", headers=self.headers,
            json={"name": "Synthetic key", "scopes": ["contracts:write"]},
        )
        self.assertEqual(key.status_code, 201, key.text)
        routes = [
            (f"{self.base}/contracts", self.headers, 202),
            (f"{self.base}/intake/email", self.headers, 202),
            (f"{self.base}/integrations/google-drive/imports", self.headers, 202),
            (f"{self.base}/integrations/dropbox/imports", self.headers, 202),
            ("/api/v1/public/contracts", {"Authorization": f"Bearer {key.json()['token']}"}, 202),
            (f"{self.base}/contracts/{contract_id}/versions", self.headers, 201),
        ]
        for path, headers, expected in routes:
            with self.subTest(path=path):
                scan, storage = Gate(), Gate()
                real_put = self.store.put

                def put(*args):
                    storage()
                    return real_put(*args)

                scan_target = "negotiation" if path.endswith("/versions") else "contracts"
                with patch(f"backend.app.service_domains.{scan_target}.scan_upload", scan), patch.object(
                    self.store, "put", put,
                ):
                    task = asyncio.create_task(self.upload(path, headers=headers))
                    try:
                        await scan.wait()
                        before = await self.read_while_blocked(task, scan)
                        scan.release.set()
                        await storage.wait()
                        during = await self.read_while_blocked(task, storage)
                        # Uncommitted/unscanned documents are not exposed by the read.
                        self.assertEqual(len(before), len(during))
                    finally:
                        scan.release.set()
                        storage.release.set()
                        response = await task
                self.assertEqual(response.status_code, expected, response.text)

    async def test_identity_lookup_and_serialization_share_owned_worker_session(self):
        gate = Gate()
        original = PlatformService.ensure_user
        loop_thread = threading.get_ident()

        def identity(service, principal):
            self.assertNotEqual(threading.get_ident(), loop_thread)
            gate()
            return original(service, principal)

        with self.owned_sessions() as sessions, patch.object(PlatformService, "ensure_user", identity):
            task = asyncio.create_task(self.upload())
            try:
                await gate.wait()
                with anyio.fail_after(1):
                    health = await self.client.get("/health/live")
                self.assertEqual(health.status_code, 200)
                self.assertFalse(task.done())
                self.assertEqual(len(sessions), 1)
            finally:
                gate.release.set()
                response = await task
            self.assertEqual(response.status_code, 202, response.text)
            self.assertTrue(sessions[0].closed_by_test)
            self.assertEqual(response.json()["contract"]["latest_job"]["id"], response.json()["job"]["id"])

    async def test_simultaneous_uploads_bound_entire_session_lifetime(self):
        scan = Gate(target=2)
        with self.owned_sessions() as sessions, patch(
            "backend.app.service_domains.contracts.scan_upload", scan,
        ):
            tasks = [asyncio.create_task(self.upload()) for _ in range(5)]
            try:
                await scan.wait()
                with anyio.fail_after(2):
                    while self.app.state.upload_limiter.statistics().tasks_waiting != 3:
                        await anyio.sleep(0.001)
                self.assertEqual(scan.calls, 2)
                self.assertEqual(len(sessions), 2, "Queued uploads must not create sessions")
                self.assertEqual(len({id(session) for session in sessions}), 2)
                self.assertEqual(self.app.state.upload_limiter.borrowed_tokens, 2)
                with anyio.fail_after(1):
                    response = await self.client.get("/health/live")
                self.assertEqual(response.status_code, 200)
            finally:
                scan.release.set()
                responses = await asyncio.gather(*tasks)
            self.assertTrue(all(response.status_code == 202 for response in responses), [r.text for r in responses])
            self.assertEqual(len(sessions), 5)
            self.assertTrue(all(session.identity_calls == 1 for session in sessions))
            self.assertEqual(self.app.state.upload_limiter.borrowed_tokens, 0)

    async def assert_no_upload_artifacts(self):
        for model in (Contract, ContractVersion, DocumentAsset, ProcessingJob):
            with self.app.state.database.session_factory() as session:
                self.assertEqual(session.scalar(select(func.count()).select_from(model)), 0, model.__name__)
        self.assertFalse(any(path.is_file() for path in self.settings.object_storage_root.rglob("*")))

    async def test_scan_rejection_and_unavailability_fail_closed_without_dispatch(self):
        self.settings.review_worker_job = "projects/test/locations/europe-west1/jobs/review"
        with patch("backend.app.review_trigger.trigger_review_worker") as trigger:
            rejected = await self.upload(content=b"EICAR-STANDARD-ANTIVIRUS-TEST-FILE")
            self.assertEqual(rejected.status_code, 422, rejected.text)
            with patch("backend.app.service_domains.contracts.scan_upload", side_effect=HTTPException(503, "Scanner unavailable")):
                unavailable = await self.upload()
            self.assertEqual(unavailable.status_code, 503, unavailable.text)
            trigger.assert_not_called()
        await self.assert_no_upload_artifacts()

    async def test_public_upload_authentication_is_owned_and_preserves_scopes_and_revocation(self):
        keys = []
        for scopes in (["contracts:read"], ["contracts:write"]):
            response = await self.client.post(
                f"{self.base}/api-keys", headers=self.headers,
                json={"name": "Synthetic key", "scopes": scopes},
            )
            self.assertEqual(response.status_code, 201, response.text)
            keys.append(response.json())
        with patch("backend.app.service_domains.contracts.scan_upload") as scanner:
            for token, expected in (("not-a-key", 401), (keys[0]["token"], 403)):
                response = await self.upload("/api/v1/public/contracts", headers={"Authorization": f"Bearer {token}"})
                self.assertEqual(response.status_code, expected, response.text)
            scanner.assert_not_called()
        authenticate = PlatformService.authenticate_api_key

        def owned_authentication(service, *args):
            service.session.check()
            return authenticate(service, *args)

        with self.owned_sessions() as sessions, patch.object(PlatformService, "authenticate_api_key", owned_authentication):
            response = await self.upload(
                "/api/v1/public/contracts", headers={"Authorization": f"Bearer {keys[1]['token']}"},
            )
            self.assertEqual(response.status_code, 202, response.text)
            self.assertEqual(len(sessions), 1)
            self.assertTrue(sessions[0].closed_by_test)
            self.assertEqual(response.json()["contract"]["organization_id"], self.organization_id)
        revoked = await self.client.delete(f"{self.base}/api-keys/{keys[1]['api_key']['id']}", headers=self.headers)
        self.assertEqual(revoked.status_code, 204, revoked.text)
        with patch("backend.app.service_domains.contracts.scan_upload") as scanner:
            response = await self.upload(
                "/api/v1/public/contracts", headers={"Authorization": f"Bearer {keys[1]['token']}"},
            )
            self.assertEqual(response.status_code, 401, response.text)
            scanner.assert_not_called()

    async def test_storage_and_commit_failures_roll_back_and_delete_partial_object(self):
        real_put = self.store.put

        def failed_put(*args):
            real_put(*args)
            raise OSError("Synthetic partial storage failure")

        for failure in (
            patch.object(self.store, "put", failed_put),
            patch.object(Session, "commit", side_effect=RuntimeError("Synthetic commit failure")),
        ):
            with self.subTest(failure=failure), failure, patch("backend.app.review_trigger.trigger_review_worker") as trigger:
                response = await self.upload()
                self.assertEqual(response.status_code, 500, response.text)
                trigger.assert_not_called()
            await self.assert_no_upload_artifacts()
        # Cleanup also releases the limiter/session so a later request can succeed.
        self.assertEqual((await self.upload()).status_code, 202)

    async def test_cancellation_keeps_running_cleanup_owned_and_cancels_queued_upload(self):
        self.settings.upload_concurrency = 1
        storage = Gate()
        scopes = {}
        completed = anyio.Event()
        real_put = self.store.put

        def failed_put(*args):
            real_put(*args)
            storage()
            raise OSError("Synthetic failure after cancellation")

        async def request(name):
            with anyio.CancelScope() as scope:
                scopes[name] = scope
                await self.upload()
            if name == "active":
                completed.set()

        with self.owned_sessions() as sessions, patch.object(self.store, "put", failed_put):
            async with anyio.create_task_group() as tasks:
                tasks.start_soon(request, "active")
                try:
                    await storage.wait()
                    tasks.start_soon(request, "queued")
                    with anyio.fail_after(2):
                        while self.app.state.upload_limiter.statistics().tasks_waiting != 1:
                            await anyio.sleep(0.001)
                    scopes["queued"].cancel()
                    scopes["active"].cancel()
                    await anyio.sleep(0)
                    self.assertFalse(completed.is_set())
                    self.assertEqual(self.app.state.upload_limiter.borrowed_tokens, 1)
                    self.assertEqual(len(sessions), 1)
                    self.assertFalse(sessions[0].closed_by_test)
                finally:
                    storage.release.set()
            self.assertTrue(completed.is_set())
            self.assertTrue(sessions[0].closed_by_test)
            self.assertEqual(self.app.state.upload_limiter.borrowed_tokens, 0)
        await self.assert_no_upload_artifacts()
        self.assertEqual((await self.upload()).status_code, 202)

    async def test_raw_task_cancellation_cannot_release_a_running_workers_slot(self):
        self.settings.upload_concurrency = 1
        storage = Gate()
        real_put = self.store.put

        def failed_put(*args):
            real_put(*args)
            storage()
            raise OSError("Synthetic failure after raw task cancellation")

        with self.owned_sessions() as sessions, patch.object(self.store, "put", failed_put):
            active = asyncio.create_task(self.upload())
            queued = None
            try:
                await storage.wait()
                active.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await active
                queued = asyncio.create_task(self.upload())
                with anyio.fail_after(2):
                    while self.app.state.upload_limiter.statistics().tasks_waiting != 1:
                        await anyio.sleep(0.001)
                self.assertEqual(len(sessions), 1)
                self.assertFalse(sessions[0].closed_by_test)
                self.assertEqual(self.app.state.upload_limiter.borrowed_tokens, 1)
                queued.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await queued
            finally:
                storage.release.set()
                if queued is not None and not queued.done():
                    queued.cancel()
                await asyncio.gather(active, *([queued] if queued else []), return_exceptions=True)
                with anyio.fail_after(3):
                    while self.app.state.upload_limiter.borrowed_tokens:
                        await anyio.sleep(0.001)
            self.assertTrue(sessions[0].closed_by_test)
        await self.assert_no_upload_artifacts()

    async def test_cancellation_between_admission_and_thread_start_releases_slot(self):
        ready = anyio.Event()
        callbacks = []
        real_run_sync = anyio.to_thread.run_sync

        async def delay_start(callback, **_kwargs):
            callbacks.append(callback)
            ready.set()
            await anyio.sleep_forever()

        request = Request({"type": "http", "app": self.app})
        with self.owned_sessions() as sessions:
            with patch("backend.app.api.uploads.anyio.to_thread.run_sync", delay_start):
                task = asyncio.create_task(run_upload(request, lambda service: self.fail("Cancelled upload ran")))
                await ready.wait()
                self.assertEqual(self.app.state.upload_limiter.borrowed_tokens, 1)
                task.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await task
            self.assertEqual(self.app.state.upload_limiter.borrowed_tokens, 0)
            # Simulate an already-scheduled worker arriving after cancellation.
            with self.assertRaises(WorkerCancelledError):
                await real_run_sync(callbacks[0])
            self.assertEqual(sessions, [])
            self.assertEqual(self.app.state.upload_limiter.borrowed_tokens, 0)

    async def test_authorization_size_retention_and_dispatch_remain_intact(self):
        with patch("backend.app.service_domains.contracts.scan_upload") as scanner:
            agent = await self.upload(headers={"Authorization": "Bearer ll_agent_synthetic"})
            self.assertEqual(agent.status_code, 401, agent.text)
            outsider = await self.upload(headers={"X-LensLayer-User": "outsider"})
            self.assertEqual(outsider.status_code, 403, outsider.text)
            self.settings.max_upload_bytes = 4
            oversized = await self.upload()
            self.assertEqual(oversized.status_code, 413, oversized.text)
            scanner.assert_not_called()
        self.settings.max_upload_bytes = 25 * 1024 * 1024
        self.settings.review_worker_job = "projects/test/locations/europe-west1/jobs/review"
        with patch("backend.app.review_trigger.trigger_review_worker") as trigger:
            invalid = await self.upload(data={"retention_days": "8"})
            self.assertEqual(invalid.status_code, 422, invalid.text)
            trigger.assert_not_called()
            accepted = await self.upload(data={
                "retain_document": "true", "retain_source_text": "true", "retention_days": "7",
                "party_role": "Customer", "jurisdiction": "Synthetic", "goal": "Understand", "risk_tolerance": "Balanced",
            })
            self.assertEqual(accepted.status_code, 202, accepted.text)
            trigger.assert_called_once()
        contract = accepted.json()["contract"]
        self.assertTrue(contract["retain_document"])
        self.assertTrue(contract["retain_source_text"])
        self.assertEqual(contract["retention_days"], 7)
        self.assertEqual(contract["organization_id"], self.organization_id)
        self.assertEqual(contract["review_context"]["party_role"], "Customer")
        self.assertEqual(accepted.json()["job"]["status"], "queued")


if __name__ == "__main__":
    unittest.main()
