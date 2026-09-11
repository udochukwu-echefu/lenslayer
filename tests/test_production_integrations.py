import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from fastapi import HTTPException

from backend.app.config import Settings
from backend.app.database import Database
from backend.app.email_delivery import ResendEmailSender, queue_email
from backend.app.malware import scan_upload
from backend.app.models import EmailDelivery, Organization
from backend.app.worker import run_worker


class ProductionSettingsTests(unittest.TestCase):
    def production_settings(self, **overrides):
        values = {
            "_env_file": None,
            "environment": "production",
            "auto_create_schema": False,
            "database_url": "postgresql+psycopg://user:password@example.neon.tech/lenslayer",
            "auth_mode": "oidc",
            "oidc_issuer": "https://tenant.auth0.com/",
            "oidc_audience": "https://api.lenslayer.example",
            "oidc_jwks_url": "https://tenant.auth0.com/.well-known/jwks.json",
            "object_storage_backend": "s3",
            "s3_bucket": "lenslayer-documents",
            "s3_endpoint_url": "https://account.r2.cloudflarestorage.com",
            "s3_access_key_id": "access-key",
            "s3_secret_access_key": "secret-key",
            "malware_scan_backend": "cloudmersive",
            "cloudmersive_api_key": "scan-key",
            "email_backend": "resend",
            "resend_api_key": "email-key",
            "resend_from_email": "LensLayer <notifications@lenslayer.example>",
        }
        values.update(overrides)
        return Settings(**values)

    def test_production_accepts_required_managed_services(self):
        settings = self.production_settings()
        self.assertEqual(settings.object_storage_backend, "s3")
        self.assertEqual(settings.malware_scan_backend, "cloudmersive")
        self.assertEqual(settings.email_backend, "resend")

    def test_production_rejects_missing_cloudmersive_or_resend(self):
        with self.assertRaises(ValueError):
            self.production_settings(malware_scan_backend="signature")
        with self.assertRaises(ValueError):
            self.production_settings(email_backend="disabled")


class CloudmersiveTests(unittest.TestCase):
    def settings(self):
        return Settings(
            _env_file=None,
            environment="test",
            malware_scan_backend="cloudmersive",
            cloudmersive_api_key="cloudmersive-key",
        )

    @patch("backend.app.malware.httpx.Client")
    def test_scans_the_file_with_server_side_api_key(self, client_class):
        response = Mock()
        response.json.return_value = {"CleanResult": True, "FoundViruses": []}
        client = client_class.return_value.__enter__.return_value
        client.post.return_value = response

        result = scan_upload(self.settings(), "contract.pdf", b"pdf bytes")

        self.assertTrue(result.clean)
        _, kwargs = client.post.call_args
        self.assertEqual(kwargs["headers"], {"Apikey": "cloudmersive-key"})
        self.assertEqual(kwargs["files"]["inputFile"][:2], ("contract.pdf", b"pdf bytes"))

    @patch("backend.app.malware.httpx.Client")
    def test_rejects_an_infected_file(self, client_class):
        response = Mock()
        response.json.return_value = {
            "CleanResult": False,
            "FoundViruses": [{"FileName": "contract.pdf", "VirusName": "Example.Test"}],
        }
        client_class.return_value.__enter__.return_value.post.return_value = response

        with self.assertRaises(HTTPException) as error:
            scan_upload(self.settings(), "contract.pdf", b"infected")

        self.assertEqual(error.exception.status_code, 422)


class ResendOutboxTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.settings = Settings(
            _env_file=None,
            environment="test",
            database_url=f"sqlite:///{Path(self.tempdir.name) / 'email.db'}",
            object_storage_root=Path(self.tempdir.name) / "objects",
            email_backend="resend",
            resend_api_key="resend-key",
            resend_from_email="LensLayer <notifications@lenslayer.example>",
            dashboard_url="https://app.lenslayer.example",
        )
        self.database = Database(self.settings)
        self.database.create_schema()

    def tearDown(self):
        self.database.dispose()
        self.tempdir.cleanup()

    def test_queues_email_in_the_same_database(self):
        with self.database.session_factory() as session:
            organization = Organization(name="Acme", slug="acme")
            session.add(organization)
            session.flush()
            delivery = queue_email(
                session,
                self.settings,
                organization_id=organization.id,
                recipient="owner@example.com",
                kind="review_ready",
                subject="Review ready",
                message="The contract is ready.",
                action_url="/contracts/123",
            )
            session.commit()
            self.assertIsNotNone(delivery)

        with self.database.session_factory() as session:
            saved = session.get(EmailDelivery, delivery.id)
            self.assertEqual(saved.status, "pending")
            self.assertEqual(saved.action_url, "https://app.lenslayer.example/contracts/123")

    @patch("backend.app.email_delivery.httpx.Client")
    def test_resend_uses_delivery_id_as_idempotency_key(self, client_class):
        response = Mock()
        response.json.return_value = {"id": "email_123"}
        client = client_class.return_value.__enter__.return_value
        client.post.return_value = response
        delivery = EmailDelivery(
            id="delivery-123",
            organization_id="org-123",
            kind="invitation_created",
            recipient="person@example.com",
            subject="Invitation",
            text_body="Join LensLayer",
            html_body="<p>Join LensLayer</p>",
        )

        message_id = ResendEmailSender(self.settings).send(delivery)

        self.assertEqual(message_id, "email_123")
        _, kwargs = client.post.call_args
        self.assertEqual(kwargs["headers"]["Idempotency-Key"], "delivery-123")
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer resend-key")

    @patch("backend.app.worker.ResendEmailSender.send", return_value="email_queued_123")
    def test_cloud_run_drain_mode_delivers_outbox_and_exits(self, send):
        with self.database.session_factory() as session:
            organization = Organization(name="Drain Test", slug="drain-test")
            session.add(organization)
            session.flush()
            queue_email(
                session,
                self.settings,
                organization_id=organization.id,
                recipient="owner@example.com",
                kind="review_ready",
                subject="Review ready",
                message="The contract is ready.",
            )
            session.commit()

        run_worker(self.settings, drain=True, review_workflow_factory=Mock)

        with self.database.session_factory() as session:
            delivery = session.query(EmailDelivery).one()
            self.assertEqual(delivery.status, "sent")
            self.assertEqual(delivery.provider_message_id, "email_queued_123")
        send.assert_called_once()


if __name__ == "__main__":
    unittest.main()
