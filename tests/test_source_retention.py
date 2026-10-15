"""Synthetic full-schema source-retention checks; no external effects."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack
from datetime import timedelta
from pathlib import Path
import sys
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text
from sqlalchemy.orm import sessionmaker

from backend.app.api import contracts as contracts_api, review as review_api
from backend.app.api.dependencies import get_current_user, get_platform_service
from backend.app.config import Settings
from backend.app.database import Database
from backend.app.models import (Contract, ContractReview, ContractVersion, DocumentAsset, EmailDelivery,
    IntegrationImport, LifecycleItem, Membership, Notification, OrganizationSettings,
    PlatformAuditEvent, ProcessingJob, User, WebhookSubscription, utcnow)
from backend.app.object_storage import LocalObjectStore
from backend.app.services import PlatformService
from backend.app.source_retention import delete_pending_sources
from backend.app import worker
from tests.postgres_support import DisposablePostgres, postgres_enabled
from tests.test_migration_lineage import data_digest, migrate, seed_every_table


class RetentionChecks:
    def initialize(self):
        migrate(self.database.engine)
        self.baseline = seed_every_table(self.database.engine)
        self.store = LocalObjectStore(Path(self.temp.name) / "objects")
        with self.database.session_factory() as session:
            contract = session.scalar(select(Contract))
            self.contract_id, self.org, self.user_id = contract.id, contract.organization_id, contract.created_by_user_id
            contract.status, contract.retain_document, contract.retain_source_text = "ready", True, True
            contract.expires_at = utcnow() + timedelta(days=1)
            asset = session.scalar(select(DocumentAsset))
            self.asset_id, self.key = asset.id, asset.storage_key
            asset.status = "available"
            self.store.put(asset.storage_key, b"PRIVATE_SYNTHETIC_SOURCE", "text/plain")
            version = session.scalar(select(ContractVersion))
            self.version_id = version.id
            version.extracted_text = "PRIVATE_SYNTHETIC_SOURCE"
            review = session.scalar(select(ContractReview).where(ContractReview.contract_id == self.contract_id))
            review.source_text, review.analysis_json = "PRIVATE_SYNTHETIC_SOURCE", '{"title":"Structured review retained"}'
            job = session.scalar(select(ProcessingJob))
            self.job_id = job.id
            job.status = "succeeded"
            for membership in session.scalars(select(Membership)):
                membership.role = "owner"
            item = session.scalar(select(LifecycleItem))
            item.status, item.due_at, item.last_notified_at, item.escalated_at = "active", utcnow() - timedelta(days=1), None, None
            session.commit()

    def expire(self):
        with self.database.session_factory() as session:
            session.get(Contract, self.contract_id).expires_at = utcnow() - timedelta(seconds=1)
            session.commit()

    def service(self, session, workflow=None):
        return PlatformService(session, self.settings, self.store, review_workflow=workflow or MagicMock())

    def test_expiry_preserves_every_ledger_graph_task_and_dashboard_record_with_multiple_assets(self):
        with self.database.session_factory() as session:
            session.add(Contract(id="future-contract", organization_id=self.org, created_by_user_id=self.user_id,
                title="Not due", source_name="future.txt", status="ready", expires_at=utcnow() + timedelta(days=1)))
            session.flush()
            session.add(ContractReview(id="future-review", organization_id=self.org, contract_id="future-contract",
                source_text="FUTURE_SOURCE"))
            session.add(DocumentAsset(id="future-asset", organization_id=self.org, contract_id="future-contract",
                storage_key="future-private-key", original_name="future.txt", size_bytes=1, sha256="2" * 64))
            session.add(DocumentAsset(id="second-asset", organization_id=self.org, contract_id=self.contract_id,
                storage_key="second-private-key", original_name="second.txt", size_bytes=1, sha256="1" * 64))
            session.add(ContractVersion(id="second-version", organization_id=self.org, contract_id=self.contract_id,
                document_asset_id="second-asset", uploaded_by_user_id=self.user_id, version_number=2,
                source_name="second.txt", sha256="1" * 64, size_bytes=1, extracted_text="SECOND_SOURCE"))
            session.commit()
        self.store.put("second-private-key", b"SECOND_SOURCE", "text/plain")
        self.store.put("future-private-key", b"FUTURE_SOURCE", "text/plain")
        self.expire()
        before = data_digest(self.database.engine, self.baseline)
        self.assertEqual(worker.purge_expired_contracts(self.database, self.store), 2)
        after = data_digest(self.database.engine, self.baseline)
        changed = {"platform_contracts", "contract_versions", "contract_reviews", "document_assets", "platform_audit_events"}
        self.assertEqual({k: v for k, v in before.items() if k not in changed}, {k: v for k, v in after.items() if k not in changed})
        with self.database.session_factory() as session:
            self.assertEqual(session.get(Contract, self.contract_id).status, "ready")
            self.assertIsNotNone(session.get(Contract, self.contract_id).expires_at)
            self.assertEqual(list(session.scalars(select(ContractVersion.extracted_text))), [None, None])
            review = session.scalar(select(ContractReview).where(ContractReview.contract_id == self.contract_id))
            self.assertIsNone(review.source_text)
            self.assertEqual(review.analysis_json, '{"title":"Structured review retained"}')
            self.assertEqual(set(session.scalars(select(DocumentAsset.status).where(DocumentAsset.contract_id == self.contract_id))), {"purged"})
            self.assertEqual(session.get(DocumentAsset, "future-asset").status, "available")
            self.assertEqual(session.get(ContractReview, "future-review").source_text, "FUTURE_SOURCE")
            self.assertEqual(session.scalar(select(func.count()).select_from(PlatformAuditEvent).where(
                PlatformAuditEvent.action == "contract.source_purged")), 1)
            self.assertEqual(session.scalar(select(func.count()).select_from(ContractVersion)), 2)
            service = self.service(session)
            user = session.get(User, self.user_id)
            self.assertEqual(service.get_contract(self.org, self.contract_id, user).id, self.contract_id)
            self.assertEqual(service.get_review(self.org, self.contract_id, user).id, review.id)
            self.assertEqual(len(service.list_contract_versions(self.org, self.contract_id, user)), 2)
        self.assertEqual(self.store.get("future-private-key"), b"FUTURE_SOURCE")
        self.assertEqual(len([p for p in self.store.root.rglob("*") if p.is_file()]), 1)
        self.assertEqual(worker.purge_expired_contracts(self.database, self.store), 0)

    def test_not_due_and_no_deadline_sources_are_unchanged(self):
        before = data_digest(self.database.engine, self.baseline)
        self.assertEqual(worker.purge_expired_contracts(self.database, self.store), 0)
        self.assertEqual(data_digest(self.database.engine, self.baseline), before)
        with self.database.session_factory() as session:
            session.get(Contract, self.contract_id).expires_at = None
            session.commit()
        before = data_digest(self.database.engine, self.baseline)
        self.assertEqual(worker.purge_expired_contracts(self.database, self.store), 0)
        self.assertEqual(data_digest(self.database.engine, self.baseline), before)
        self.assertEqual(self.store.get(self.key), b"PRIVATE_SYNTHETIC_SOURCE")

    def test_failed_object_delete_is_durable_redacted_denies_reads_then_retries(self):
        self.expire()
        with patch.object(self.store, "delete", side_effect=RuntimeError("PRIVATE_KEY provider response PRIVATE_SYNTHETIC_SOURCE")) as delete, \
             self.assertLogs("backend.app.source_retention", level="WARNING") as logs:
            self.assertEqual(worker.purge_expired_contracts(self.database, self.store), 0)
            delete.assert_called_once_with(self.key)
        rendered = " ".join(logs.output)
        self.assertNotIn("PRIVATE", rendered)
        self.assertNotIn(self.key, rendered)
        self.assertEqual(self.store.get(self.key), b"PRIVATE_SYNTHETIC_SOURCE")
        with self.database.session_factory() as session:
            self.assertEqual(session.get(DocumentAsset, self.asset_id).status, "purge_pending")
            self.assertIsNone(session.scalar(select(ContractReview.source_text)))
            service = self.service(session)
            user = session.get(User, self.user_id)
            with self.assertRaises(HTTPException) as denied:
                service._source_version(self.org, self.contract_id)
            self.assertEqual(denied.exception.status_code, 409)
            self.assertEqual(service._version_text(session.get(ContractVersion, self.version_id)), "")
            with self.assertRaises(HTTPException):
                service.answer_contract_question(self.org, self.contract_id, user, "What is retained?")
            with self.assertRaises(HTTPException):
                service.redline_export(self.org, self.contract_id, user)
        self.assertEqual(worker.purge_expired_contracts(self.database, self.store), 1)
        with self.assertRaises(FileNotFoundError):
            self.store.get(self.key)

    def test_crash_after_delete_before_ack_is_recovered_by_idempotent_delete(self):
        self.expire()
        actual_delete = self.store.delete
        def crash_after_effect(key):
            actual_delete(key)
            raise KeyboardInterrupt("synthetic worker termination")
        with patch.object(self.store, "delete", side_effect=crash_after_effect), self.assertRaises(KeyboardInterrupt):
            worker.purge_expired_contracts(self.database, self.store)
        with self.database.session_factory() as session:
            self.assertEqual(session.get(DocumentAsset, self.asset_id).status, "purge_pending")
            self.assertIsNone(session.scalar(select(ContractReview.source_text)))
        self.assertEqual(delete_pending_sources(self.database, self.store), 1)

    def test_expired_pending_review_is_fenced_without_source_or_provider_dispatch(self):
        with self.database.session_factory() as session:
            session.get(Contract, self.contract_id).status = "processing"
            session.get(ProcessingJob, self.job_id).status = "queued"
            session.commit()
        self.expire()
        worker.purge_expired_contracts(self.database, self.store)
        with patch.object(worker, "build_review_workflow", side_effect=AssertionError("No model initialization")), \
             patch.object(self.store, "get", side_effect=AssertionError("Expired source read forbidden")):
            self.assertIsNone(worker.claim_next_job(self.database, self.settings))
            worker.process_job(self.database, self.store, self.job_id, self.settings, review_workflow=MagicMock())
        with self.database.session_factory() as session:
            self.assertEqual(session.get(ProcessingJob, self.job_id).error_code, "SourceRetentionExpired")
            self.assertEqual(session.get(Contract, self.contract_id).status, "failed")

    def test_late_review_completion_cannot_rehydrate_purged_source_or_emit_notifications(self):
        with self.database.session_factory() as session:
            session.get(ProcessingJob, self.job_id).status = "queued"
            session.commit()
        claim = worker.claim_next_job(self.database, self.settings)
        def late_analysis(*args):
            self.expire()
            worker.purge_expired_contracts(self.database, self.store)
            return {"title": "Must not overwrite existing review"}
        workflow = MagicMock()
        workflow.extract_document.return_value = SimpleNamespace(text="PRIVATE_SYNTHETIC_SOURCE", quality={})
        workflow.analyze_contract.side_effect = late_analysis
        before = data_digest(self.database.engine, self.baseline)
        worker.process_job(self.database, self.store, claim, self.settings, workflow)
        after = data_digest(self.database.engine, self.baseline)
        for table in ("notifications", "email_deliveries", "webhook_deliveries", "agent_actions", "agent_runs"):
            self.assertEqual(before[table], after[table], table)
        with self.database.session_factory() as session:
            self.assertIsNone(session.scalar(select(ContractReview.source_text)))
            self.assertEqual(session.scalar(select(ContractReview.analysis_json)), '{"title":"Structured review retained"}')
            self.assertEqual(session.get(ProcessingJob, self.job_id).status, "failed")

    def test_reclaimed_review_cannot_commit_duplicate_effects(self):
        with self.database.session_factory() as session:
            session.get(ProcessingJob, self.job_id).status = "queued"
            session.commit()
        claim = worker.claim_next_job(self.database, self.settings)
        before = data_digest(self.database.engine, self.baseline)
        def reclaimed(*args):
            with self.database.session_factory() as session:
                job = session.get(ProcessingJob, claim)
                job.started_at += timedelta(seconds=1)
                session.commit()
            return {"title": "Stale worker result"}
        workflow = MagicMock()
        workflow.extract_document.return_value = SimpleNamespace(text="PRIVATE_SYNTHETIC_SOURCE", quality={})
        workflow.analyze_contract.side_effect = reclaimed
        worker.process_job(self.database, self.store, claim, self.settings, workflow)
        after = data_digest(self.database.engine, self.baseline)
        for table in ("platform_contracts", "contract_reviews", "notifications", "email_deliveries", "webhook_deliveries"):
            self.assertEqual(before[table], after[table], table)

    def _late_failure_fixture(self, outcome):
        with self.database.session_factory() as session:
            session.get(Contract, self.contract_id).status = "processing"
            session.get(ProcessingJob, self.job_id).status = "queued"
            for preferences in session.scalars(select(OrganizationSettings)):
                preferences.notification_review_failed = True
            for membership in session.scalars(select(Membership)):
                membership.email_notifications = True
            for subscription in session.scalars(select(WebhookSubscription)):
                subscription.status = "active"
                subscription.events_json = '["contract.review_failed"]'
            session.commit()
        settings = self.settings.model_copy(update={"email_backend": "resend"})
        claim = worker.claim_next_job(self.database, settings)
        snapshots = {}
        def late_analysis(*args):
            outcome(claim)
            # Record after deadline/purge/claim changes, before provider returns.
            snapshots["before_return"] = data_digest(self.database.engine, self.baseline)
            raise RuntimeError("PRIVATE synthetic late provider failure")
        workflow = MagicMock()
        workflow.extract_document.return_value = SimpleNamespace(text="MUST_NOT_RESTORE_SOURCE", quality={})
        workflow.analyze_contract.side_effect = late_analysis
        with patch.object(worker, "enqueue_notification", wraps=worker.enqueue_notification) as notify, \
             patch.object(worker, "enqueue_webhook_deliveries", wraps=worker.enqueue_webhook_deliveries) as webhook, \
             patch.object(worker.ResendEmailSender, "send", side_effect=AssertionError("No provider calls")):
            with self.assertLogs("backend.app.worker", level="ERROR"):
                worker.process_job(self.database, self.store, claim, settings, workflow)
            notify.assert_not_called()
            webhook.assert_not_called()
        after = data_digest(self.database.engine, self.baseline)
        for table in self.baseline.tables:
            if table not in {"alembic_version", "processing_jobs", "platform_contracts", "integration_imports"}:
                self.assertEqual(snapshots["before_return"][table], after[table], table)
        return claim, snapshots["before_return"], after

    def test_deadline_only_provider_failure_is_terminal_without_failure_effects(self):
        claim, _, _ = self._late_failure_fixture(lambda _: self.expire())
        with self.database.session_factory() as session:
            job = session.get(ProcessingJob, claim)
            self.assertEqual((job.status, job.error_code), ("failed", "SourceRetentionExpired"))
            self.assertIsNotNone(job.completed_at)
            self.assertEqual(session.get(Contract, self.contract_id).status, "failed")
            self.assertEqual(session.scalar(select(IntegrationImport.status)), "failed")
            # Exception handling does not delete or restore source; maintenance
            # owns the durable purge, with every structured/ledger link retained.
            self.assertEqual(session.scalar(select(ContractReview.source_text)), "PRIVATE_SYNTHETIC_SOURCE")
            self.assertEqual(session.get(DocumentAsset, self.asset_id).status, "available")
        self.assertEqual(worker.purge_expired_contracts(self.database, self.store), 1)
        with self.database.session_factory() as session:
            self.assertIsNone(session.scalar(select(ContractReview.source_text)))
            self.assertEqual(session.get(DocumentAsset, self.asset_id).status, "purged")

    def test_provider_failure_after_purge_preserves_terminal_state_and_pending_delete(self):
        def purge(_):
            self.expire()
            with patch.object(self.store, "delete", side_effect=RuntimeError("synthetic deferred deletion")), \
                 self.assertLogs("backend.app.source_retention", level="WARNING"):
                self.assertEqual(worker.purge_expired_contracts(self.database, self.store), 0)
        claim, before, after = self._late_failure_fixture(purge)
        self.assertEqual(before, after)  # Already terminal: strict no-op.
        with self.database.session_factory() as session:
            job = session.get(ProcessingJob, claim)
            self.assertEqual((job.status, job.error_code), ("failed", "SourceRetentionExpired"))
            self.assertIsNone(session.scalar(select(ContractReview.source_text)))
            self.assertEqual(session.get(DocumentAsset, self.asset_id).status, "purge_pending")
        self.assertEqual(delete_pending_sources(self.database, self.store), 1)

    def test_unavailable_asset_provider_failure_is_terminal_without_failure_effects(self):
        def unavailable(_):
            with self.database.session_factory() as session:
                session.get(DocumentAsset, self.asset_id).status = "purge_pending"
                session.commit()
        claim, _, _ = self._late_failure_fixture(unavailable)
        with self.database.session_factory() as session:
            job = session.get(ProcessingJob, claim)
            self.assertEqual((job.status, job.error_code), ("failed", "SourceUnavailable"))
            self.assertEqual(session.get(DocumentAsset, self.asset_id).status, "purge_pending")
        self.assertEqual(delete_pending_sources(self.database, self.store), 1)

    def test_reclaimed_provider_failure_with_expired_source_remains_noop(self):
        def reclaimed(claim):
            self.expire()
            with self.database.session_factory() as session:
                session.get(ProcessingJob, claim).started_at += timedelta(seconds=1)
                session.commit()
        claim, before, after = self._late_failure_fixture(reclaimed)
        self.assertEqual(before, after)
        with self.database.session_factory() as session:
            self.assertEqual(session.get(ProcessingJob, claim).status, "running")

    def test_concurrent_review_claims_have_only_one_winner(self):
        with self.database.session_factory() as session:
            session.get(ProcessingJob, self.job_id).status = "queued"
            session.commit()
        barrier = threading.Barrier(2)
        def claim():
            barrier.wait(timeout=5)
            return worker.claim_next_job(self.database, self.settings)
        with ThreadPoolExecutor(max_workers=2) as pool:
            first, second = pool.submit(claim), pool.submit(claim)
            winners = [first.result(timeout=5), second.result(timeout=5)]
        self.assertCountEqual(winners, [self.job_id, None])

    def test_nonretained_object_failure_does_not_rollback_committed_review_and_retries(self):
        with self.database.session_factory() as session:
            session.get(Contract, self.contract_id).retain_document = False
            session.get(ProcessingJob, self.job_id).status = "queued"
            session.commit()
        claim = worker.claim_next_job(self.database, self.settings)
        workflow = MagicMock()
        workflow.extract_document.return_value = SimpleNamespace(text="PRIVATE_SYNTHETIC_SOURCE", quality={})
        workflow.analyze_contract.return_value = {"title": "Committed review"}
        def fail_after_commit(key):
            with self.database.session_factory() as session:
                self.assertEqual(session.get(ProcessingJob, claim).status, "succeeded")
                self.assertEqual(session.scalar(select(ContractReview.analysis_json)), '{"title":"Committed review"}')
            raise RuntimeError("PRIVATE object-provider response")
        with patch.object(self.store, "delete", side_effect=fail_after_commit), \
             self.assertLogs("backend.app.source_retention", level="WARNING"):
            worker.process_job(self.database, self.store, claim, self.settings, workflow)
        with self.database.session_factory() as session:
            self.assertEqual(session.get(ProcessingJob, claim).status, "succeeded")
            self.assertEqual(session.get(DocumentAsset, self.asset_id).status, "purge_pending")
        self.assertEqual(delete_pending_sources(self.database, self.store), 1)


class SQLiteRetentionTests(RetentionChecks, unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.settings = Settings(_env_file=None, environment="test", auto_create_schema=False,
            database_url=f"sqlite:///{Path(self.temp.name) / 'retention.db'}")
        self.database = Database(self.settings)
        self.initialize()

    def tearDown(self):
        self.database.dispose()
        self.temp.cleanup()

    def test_http_reads_denied_but_contract_and_review_metadata_remain(self):
        self.expire()
        # Real API routing; denial already applies before maintenance removes bytes.
        with self.database.session_factory() as session:
            service = self.service(session)
            app = FastAPI()
            app.include_router(contracts_api.router, prefix="/api/v1")
            app.include_router(review_api.router, prefix="/api/v1")
            app.dependency_overrides[get_platform_service] = lambda: service
            app.dependency_overrides[get_current_user] = lambda: session.get(User, self.user_id)
            base = f"/api/v1/organizations/{self.org}/contracts/{self.contract_id}"
            with TestClient(app) as client:
                self.assertEqual(client.get(base).status_code, 200)
                self.assertEqual(client.get(base + "/review").status_code, 200)
                self.assertEqual(client.post(base + "/questions", json={"question": "What is the deadline?"}).status_code, 409)
                self.assertEqual(client.get(base + "/redline.docx").status_code, 409)
                worker.purge_expired_contracts(self.database, self.store)
                session.expire_all()
                self.assertEqual(client.get(base).status_code, 200)
                metadata = client.get(base + "/review")
                self.assertEqual(metadata.status_code, 200)
                self.assertFalse(metadata.json()["source_text_retained"])
                self.assertEqual(client.post(base + "/questions", json={"question": "What is the deadline?"}).status_code, 409)
                self.assertEqual(client.get(base + "/redline.docx").status_code, 409)

    def test_expired_version_upload_is_denied_before_scanner_or_storage(self):
        self.expire()
        with self.database.session_factory() as session, patch("backend.app.service_domains.negotiation.scan_upload") as scanner:
            service = self.service(session)
            with self.assertRaises(HTTPException):
                service.create_contract_version(self.org, self.contract_id, session.get(User, self.user_id),
                    original_name="new.txt", content_type="text/plain", data=b"new", label="New", notes="")
            scanner.assert_not_called()

    def test_portfolio_never_passes_expired_extracted_text_to_question_workflow(self):
        self.expire()
        with self.database.session_factory() as session:
            workflow = MagicMock()
            workflow.answer_portfolio.return_value = SimpleNamespace(answer="Structured only", sources=[], generated_by="extractive")
            service = self.service(session, workflow)
            service.portfolio_question(self.org, session.get(User, self.user_id), "What is retained?")
            documents = workflow.answer_portfolio.call_args.args[0]
            self.assertNotIn("PRIVATE_SYNTHETIC_SOURCE", " ".join(d.text for d in documents))
            self.assertIn("Structured review retained", documents[0].text)

    def test_review_failure_log_contains_no_source_key_or_provider_exception(self):
        with self.database.session_factory() as session:
            session.get(ProcessingJob, self.job_id).status = "queued"
            session.commit()
        claim = worker.claim_next_job(self.database, self.settings)
        workflow = MagicMock()
        workflow.extract_document.side_effect = RuntimeError(self.key + " PRIVATE_PROVIDER PRIVATE_SYNTHETIC_SOURCE")
        with self.assertLogs("backend.app.worker", level="ERROR") as logs:
            worker.process_job(self.database, self.store, claim, self.settings, workflow)
        rendered = " ".join(logs.output)
        self.assertNotIn(self.key, rendered)
        self.assertNotIn("PRIVATE", rendered)

    def test_s3_transport_has_explicit_bounded_io_and_no_hidden_retries(self):
        from backend.app.object_storage import S3ObjectStore
        boto = MagicMock()
        config = MagicMock()
        with patch.dict(sys.modules, {"boto3": boto, "botocore": MagicMock(), "botocore.config": config}):
            S3ObjectStore(self.settings)
        config.Config.assert_called_once_with(connect_timeout=5, read_timeout=10, retries={"total_max_attempts": 1})
        self.assertEqual(boto.client.call_args.kwargs["config"], config.Config.return_value)

    def test_agents_only_avoids_all_document_maintenance_and_ondemand_empty_drain_does_not_poll(self):
        with ExitStack() as stack:
            for name in ("expire_agent_runs", "purge_expired_context"):
                stack.enter_context(patch("backend.app.worker." + name, return_value=0))
            for name in ("recover_workflow_graphs", "nudge_finished_hosted_tasks"):
                stack.enter_context(patch("backend.app.worker." + name))
            stack.enter_context(patch("backend.app.agent_wake.recover_hosted_waits"))
            for name in ("claim_next_hosted_task", "claim_next_agent_action"):
                stack.enter_context(patch("backend.app.worker." + name, return_value=None))
            stack.enter_context(patch("backend.app.worker.build_object_store", return_value=self.store))
            for name in ("purge_expired_contracts", "process_lifecycle_reminders", "claim_next_email", "claim_next_job", "claim_next_webhook"):
                stack.enter_context(patch("backend.app.worker." + name, side_effect=AssertionError("Document lane forbidden")))
            stack.enter_context(patch("backend.app.worker.time.sleep", side_effect=AssertionError("No idle polling")))
            settings = self.settings.model_copy(update={"agent_worker_mode": "on_demand"})
            worker.run_worker(settings, agents_only=True, max_drain_seconds=5)

    def test_email_retry_backoff_and_successful_invitation_body_cleanup(self):
        settings = self.settings.model_copy(update={"email_backend": "resend"})
        with self.database.session_factory() as session:
            session.query(EmailDelivery).delete()
            delivery = EmailDelivery(organization_id=self.org, kind="invitation_created", recipient="synthetic@example.test",
                subject="Invitation", text_body="SYNTHETIC_INVITE_TOKEN", html_body="SYNTHETIC_INVITE_TOKEN", action_url="/invite/SYNTHETIC_INVITE_TOKEN")
            session.add(delivery)
            session.commit()
            identifier = delivery.id
        self.assertEqual(worker.claim_next_email(self.database, settings), identifier)
        with patch.object(worker.ResendEmailSender, "send", side_effect=RuntimeError("PRIVATE provider response")):
            worker.process_email(self.database, settings, identifier)
        self.assertIsNone(worker.claim_next_email(self.database, settings))
        with self.database.session_factory() as session:
            delivery = session.get(EmailDelivery, identifier)
            self.assertEqual(delivery.last_error, "email_delivery_failed")
            delivery.updated_at = utcnow() - timedelta(seconds=301)
            session.commit()
        self.assertEqual(worker.claim_next_email(self.database, settings), identifier)
        with patch.object(worker.ResendEmailSender, "send", return_value="synthetic-message"):
            worker.process_email(self.database, settings, identifier)
        with self.database.session_factory() as session:
            delivery = session.get(EmailDelivery, identifier)
            self.assertEqual((delivery.status, delivery.text_body, delivery.html_body, delivery.action_url), ("sent", "", "", ""))


@unittest.skipUnless(postgres_enabled(), "Local disposable PostgreSQL not opted in")
class PostgresRetentionTests(RetentionChecks, unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.pg = DisposablePostgres()
        self.settings = Settings(_env_file=None, environment="test", auto_create_schema=False)
        self.database = Database(self.settings)
        self.database.dispose()
        self.database.engine = self.pg.engine
        self.database.session_factory = sessionmaker(bind=self.pg.engine, expire_on_commit=False)
        self.initialize()

    def tearDown(self):
        self.pg.close()
        self.temp.cleanup()

    def test_concurrent_workers_do_not_duplicate_object_deletes_or_audit(self):
        self.expire()
        entered, release = threading.Event(), threading.Event()
        calls = []
        actual_delete = self.store.delete
        def held_delete(key):
            calls.append(key)
            entered.set()
            self.assertTrue(release.wait(5))
            actual_delete(key)
        with patch.object(self.store, "delete", side_effect=held_delete), ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(worker.purge_expired_contracts, self.database, self.store)
            self.assertTrue(entered.wait(5))
            second = pool.submit(delete_pending_sources, self.database, self.store)
            self.assertEqual(second.result(timeout=5), 0)
            release.set()
            self.assertEqual(first.result(timeout=5), 1)
        self.assertEqual(calls, [self.key])
        self.assertEqual(worker.purge_expired_contracts(self.database, self.store), 0)
        with self.database.session_factory() as session:
            self.assertEqual(session.scalar(select(func.count()).select_from(PlatformAuditEvent).where(
                PlatformAuditEvent.action == "contract.source_purged")), 1)

    def test_concurrent_lifecycle_maintenance_enqueues_one_reminder(self):
        before = data_digest(self.database.engine, self.baseline)
        entered, release = threading.Event(), threading.Event()
        real_enqueue = worker.enqueue_notification
        def held_enqueue(*args, **kwargs):
            entered.set()
            self.assertTrue(release.wait(5))
            return real_enqueue(*args, **kwargs)
        with patch.object(worker, "enqueue_notification", side_effect=held_enqueue), ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(worker.process_lifecycle_reminders, self.database, self.settings)
            self.assertTrue(entered.wait(5))
            self.assertEqual(pool.submit(worker.process_lifecycle_reminders, self.database, self.settings).result(timeout=5), 0)
            release.set()
            self.assertEqual(first.result(timeout=5), 1)
        self.assertEqual(worker.process_lifecycle_reminders(self.database, self.settings), 0)
        with self.database.session_factory() as session:
            self.assertEqual(session.scalar(select(func.count()).select_from(Notification).where(Notification.kind == "lifecycle_overdue")), 1)
        after = data_digest(self.database.engine, self.baseline)
        self.assertEqual(before["agent_actions"], after["agent_actions"])

    def test_two_complete_purge_workers_do_not_duplicate_deletion_or_audit(self):
        self.expire()
        entered, release = threading.Event(), threading.Event()
        calls = []
        actual_delete = self.store.delete
        def held_delete(key):
            calls.append(key)
            entered.set()
            self.assertTrue(release.wait(5))
            actual_delete(key)
        with patch.object(self.store, "delete", side_effect=held_delete), ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(worker.purge_expired_contracts, self.database, self.store)
            self.assertTrue(entered.wait(5))
            second = pool.submit(worker.purge_expired_contracts, self.database, self.store)
            release.set()
            self.assertEqual(first.result(timeout=5) + second.result(timeout=5), 1)
        self.assertEqual(calls, [self.key])
        with self.database.session_factory() as session:
            self.assertEqual(session.scalar(select(func.count()).select_from(PlatformAuditEvent).where(
                PlatformAuditEvent.action == "contract.source_purged")), 1)
