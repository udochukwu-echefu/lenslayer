"""Crashes on the final document attempt must not leave an endless processing UI."""
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from backend.app.application import create_app
from backend.app.config import Settings
from backend.app.models import Contract, DocumentAsset, IntegrationImport, Notification, PlatformAuditEvent, ProcessingJob, User, utcnow
from backend.app.worker import recover_exhausted_document_jobs, process_job, run_worker
from tests.postgres_support import DisposablePostgres, postgres_enabled


class DocumentLeaseRecoveryTests(unittest.TestCase):
    def setUp(self):
        root = Path(self.enterContext(tempfile.TemporaryDirectory(prefix="lenslayer-lease-test-")))
        self.settings = Settings(_env_file=None, environment="test", auth_mode="local", auto_create_schema=True,
            database_url=getattr(self, "database_url", f"sqlite:///{root / 'db.sqlite'}"), object_storage_backend="local", object_storage_root=root / "objects",
            malware_scan_backend="signature", email_backend="disabled", review_worker_job="", agent_worker_mode="continuous", hosted_model_enabled=False)
        self.client = self.enterContext(TestClient(create_app(self.settings, review_workflow_factory=lambda: object())))
        self.db = self.client.app.state.database
        self.store = self.client.app.state.object_store
        headers = {"X-LensLayer-User": "lease-owner", "X-LensLayer-Email": "lease@example.invalid"}
        self.org = self.client.post("/api/v1/organizations", headers=headers, json={"name": "Lease tests", "slug": "lease-tests"}).json()["id"]
        self.user = self.client.get("/api/v1/me", headers=headers).json()["id"]

    def seed(self, *, stale=True, exhausted=True, expired=False, unavailable=False):
        with self.db.session_factory() as session:
            contract = Contract(organization_id=self.org, created_by_user_id=self.user, title="Synthetic crashed review", source_name="fixture.txt", status="processing",
                expires_at=utcnow() + timedelta(days=-1 if expired else 30))
            session.add(contract); session.flush()
            asset = DocumentAsset(organization_id=self.org, contract_id=contract.id, original_name="fixture.txt", storage_key=f"synthetic/{contract.id}.txt", content_type="text/plain", size_bytes=4, sha256="0" * 64, status="purge_pending" if unavailable else "available")
            session.add(asset); session.flush()
            job = ProcessingJob(organization_id=self.org, contract_id=contract.id, document_asset_id=asset.id, status="running", attempts=self.settings.worker_max_attempts if exhausted else 1,
                started_at=utcnow() - timedelta(seconds=self.settings.worker_lease_seconds + 60 if stale else 1))
            session.add(job)
            imported = IntegrationImport(organization_id=self.org, contract_id=contract.id, provider="email", source_type="file", external_id=contract.id,
                title=contract.title, original_name="fixture.txt", sha256="0" * 64, status="processing")
            session.add(imported); session.commit()
            return contract.id, job.id, imported.id

    def test_final_crashed_attempt_fails_once_with_atomic_effects(self):
        contract, job, imported = self.seed()
        self.assertEqual(recover_exhausted_document_jobs(self.db, self.settings), 1)
        self.assertEqual(recover_exhausted_document_jobs(self.db, self.settings), 0)
        with self.db.session_factory() as session:
            row = session.get(ProcessingJob, job)
            self.assertEqual(row.status, "failed"); self.assertEqual(row.attempts, self.settings.worker_max_attempts)
            self.assertIsNotNone(row.completed_at); self.assertEqual(row.error_code, "WorkerLeaseExpired")
            self.assertEqual(session.get(Contract, contract).status, "failed")
            self.assertEqual(session.get(IntegrationImport, imported).status, "failed")
            self.assertEqual(session.scalar(select(func.count()).select_from(PlatformAuditEvent).where(PlatformAuditEvent.action == "review.failed")), 1)
            self.assertEqual(session.scalar(select(func.count()).select_from(Notification)), 1)
        workflow = Mock()
        process_job(self.db, self.store, job, self.settings, workflow)
        workflow.extract_document.assert_not_called()

    def test_live_and_retryable_leases_unchanged_and_limit_is_bounded(self):
        live = self.seed(stale=False)
        retry = self.seed(exhausted=False)
        self.seed(); self.seed()
        self.assertEqual(recover_exhausted_document_jobs(self.db, self.settings, limit=-1), 0)
        self.assertEqual(recover_exhausted_document_jobs(self.db, self.settings, limit=1), 1)
        self.assertEqual(recover_exhausted_document_jobs(self.db, self.settings, limit=1), 1)
        self.assertEqual(recover_exhausted_document_jobs(self.db, self.settings), 0)
        with self.db.session_factory() as session:
            for _, job, _ in [live, retry]:
                self.assertEqual(session.get(ProcessingJob, job).status, "running")

    def test_retention_or_unavailable_source_suppresses_failure_notifications_and_audit(self):
        cases = [self.seed(expired=True), self.seed(unavailable=True)]
        self.assertEqual(recover_exhausted_document_jobs(self.db, self.settings), 2)
        with self.db.session_factory() as session:
            for contract, job, imported in cases:
                self.assertEqual(session.get(ProcessingJob, job).status, "failed")
                self.assertEqual(session.get(Contract, contract).status, "failed")
                self.assertEqual(session.get(IntegrationImport, imported).status, "failed")
            self.assertEqual(session.scalar(select(func.count()).select_from(Notification)), 0)
            self.assertEqual(session.scalar(select(func.count()).select_from(PlatformAuditEvent).where(PlatformAuditEvent.action == "review.failed")), 0)

    def test_concurrent_recovery_has_one_transition_and_one_effect_set(self):
        self.seed()
        barrier = threading.Barrier(2)
        def recover():
            barrier.wait(timeout=10)
            return recover_exhausted_document_jobs(self.db, self.settings)
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(recover) for _ in range(2)]
            self.assertEqual(sum(f.result(timeout=15) for f in futures), 1)
        with self.db.session_factory() as session:
            self.assertEqual(session.scalar(select(func.count()).select_from(Notification)), 1)

    def test_documents_only_drain_recovers_and_exits_without_idle_polling_or_provider(self):
        _, job, _ = self.seed()
        factory = Mock(side_effect=AssertionError("Provider workflow must not be initialized"))
        with patch("backend.app.worker.time.sleep", side_effect=AssertionError("Idle polling forbidden")):
            run_worker(self.settings, drain=True, documents_only=True, review_workflow_factory=factory)
        with self.db.session_factory() as session:
            self.assertEqual(session.get(ProcessingJob, job).status, "failed")
        factory.assert_not_called()


@unittest.skipUnless(postgres_enabled(), "Disposable local PostgreSQL not opted in")
class PostgresDocumentLeaseRecoveryTests(DocumentLeaseRecoveryTests):
    def setUp(self):
        pg = DisposablePostgres()
        self.addCleanup(pg.close)
        self.database_url = pg.url
        super().setUp()


if __name__ == "__main__":
    unittest.main()
