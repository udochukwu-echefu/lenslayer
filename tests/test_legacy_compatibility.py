"""Synthetic-only tests for the two recovered production behaviors; no delivery."""
from contextlib import ExitStack
from datetime import timedelta
import hashlib
import hmac
from pathlib import Path
import socket
import tempfile
import unittest
from unittest.mock import ANY, MagicMock, call, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from backend.app.api import public_api, workspace
from backend.app.api.dependencies import get_current_user, get_platform_service
from backend.app.config import Settings
from backend.app.database import Database
from backend.app.email_delivery import queue_email
from backend.app.models import EmailDelivery, Membership, Notification, Organization, User, WebhookDelivery, WebhookSubscription, utcnow
from backend.app.services import PlatformService
from backend.app import webhook_delivery as outbound
from backend.app import worker
from tests.test_migration_lineage import migrate


class LegacyRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.settings = Settings(_env_file=None, environment="test", auto_create_schema=False,
            database_url=f"sqlite:///{Path(self.temp.name) / 'compat.db'}", email_backend="resend",
            resend_api_key="synthetic-never-sent", resend_from_email="test@example.test")
        self.database = Database(self.settings)
        migrate(self.database.engine)
        self.session = self.database.session_factory()
        self.user = User(id="u", external_subject="synthetic", email="u@example.test", display_name="Synthetic")
        self.other = User(id="other", external_subject="other", email="other@example.test")
        self.session.add_all([self.user, self.other, Organization(id="o", name="One", slug="one"),
                              Organization(id="b", name="Two", slug="two")])
        self.session.flush()
        self.session.add_all([Membership(id="m", organization_id="o", user_id="u", role="owner", email_notifications=False),
                              Membership(id="n", organization_id="b", user_id="u", role="viewer", email_notifications=True)])
        self.session.commit()
        self.service = PlatformService(self.session, self.settings, object_store=MagicMock())

    def tearDown(self):
        self.session.close()
        self.database.dispose()
        self.temp.cleanup()

    def client(self):
        app = FastAPI()
        app.include_router(workspace.router, prefix="/api/v1")
        app.include_router(public_api.router, prefix="/api/v1")
        app.dependency_overrides[get_platform_service] = lambda: self.service
        app.dependency_overrides[get_current_user] = lambda: self.user
        return TestClient(app)

    def make_delivery(self, secret="whsec_synthetic_preserved_only"):
        subscription = WebhookSubscription(id="w", organization_id="o", created_by_user_id="u",
            target_url="https://hooks.example.test/events", signing_secret=secret,
            signing_secret_hash=hashlib.sha256((secret or "missing").encode()).hexdigest())
        delivery = WebhookDelivery(id="d", organization_id="o", subscription_id="w", event_type="contract.created",
                                  payload_json='{"event":"contract.created","data":{"id":"synthetic"}}')
        self.session.add_all([subscription, delivery])
        self.session.commit()
        return subscription, delivery

    def test_preserved_optout_suppresses_email_not_inapp_notification_or_other_workspace(self):
        with patch("backend.app.email_delivery.ResendEmailSender.send", side_effect=AssertionError("No sends")):
            self.service._notify("o", "u", None, "review_ready", "Ready", "Synthetic", "/contracts")
            self.session.commit()
            self.assertEqual(self.session.scalar(select(func.count()).select_from(Notification)), 1)
            self.assertEqual(self.session.scalar(select(func.count()).select_from(EmailDelivery)), 0)
            self.assertIsNotNone(queue_email(self.session, self.settings, organization_id="b", user_id="u",
                recipient="u@example.test", kind="review_ready", subject="Synthetic", message="Synthetic"))
            # Invitations without a member user_id retain historical behavior.
            self.assertIsNotNone(queue_email(self.session, self.settings, organization_id="o",
                recipient="invite@example.test", kind="invitation_created", subject="Synthetic", message="Synthetic"))
            self.session.commit()
            self.assertEqual(self.session.scalar(select(func.count()).select_from(EmailDelivery)), 2)

    def test_preferences_http_preserves_false_and_is_membership_scoped(self):
        with self.client() as client:
            url = "/api/v1/organizations/o/preferences"
            self.assertEqual(client.get(url).json(), {"email_notifications": False})
            self.assertEqual(client.patch(url, json={"email_notifications": True}).json(), {"email_notifications": True})
            self.assertTrue(client.get(url).json()["email_notifications"])
            self.assertEqual(client.patch(url, json={"email_notifications": False}).status_code, 200)
            self.assertFalse(client.get(url).json()["email_notifications"])
            self.user = self.other
            self.assertEqual(client.get(url).status_code, 403)
            self.assertEqual(client.patch(url, json={"email_notifications": True}).status_code, 403)

    def test_webhook_create_list_and_rotation_http_do_not_leak_keys_or_reset_attempts(self):
        with self.client() as client:
            url = "/api/v1/organizations/o/webhooks"
            response = client.post(url, json={"target_url": "https://hooks.example.test/events", "events": ["contract.created"]})
            self.assertEqual(response.status_code, 201, response.text)
            created = response.json()
            identifier = created["subscription"]["id"]
            stored = self.session.get(WebhookSubscription, identifier)
            self.assertEqual(stored.signing_secret, created["signing_secret"])
            self.assertEqual(stored.signing_secret_hash, hashlib.sha256(stored.signing_secret.encode()).hexdigest())
            self.assertNotIn("signing_secret", created["subscription"])
            self.assertNotIn(created["signing_secret"], client.get(url).text)
            failed = WebhookDelivery(organization_id="o", subscription_id=identifier, event_type="contract.created", status="failed", attempts=5)
            self.session.add(failed)
            self.session.commit()
            rotation = client.post(f"{url}/{identifier}/rotate-secret")
            self.assertEqual(rotation.status_code, 200, rotation.text)
            self.assertNotEqual(rotation.json()["signing_secret"], created["signing_secret"])
            self.session.refresh(failed)
            self.assertEqual((failed.status, failed.attempts), ("failed", 5))
            self.assertEqual(client.post(f"/api/v1/organizations/b/webhooks/{identifier}/rotate-secret").status_code, 403)
            client.delete(f"{url}/{identifier}")
            self.assertEqual(client.post(f"{url}/{identifier}/rotate-secret").status_code, 409)

    def test_worker_sends_exact_persisted_key_body_and_stable_delivery_id(self):
        subscription, delivery = self.make_delivery()
        claim = worker.claim_next_webhook(self.database)
        self.assertEqual(claim, ("d", 1))
        with patch("backend.app.worker.send_webhook", return_value=204) as send:
            worker.process_webhook(self.database, *claim)
            send.assert_called_once_with(subscription.target_url, subscription.signing_secret,
                                         delivery.event_type, "d", delivery.payload_json.encode())
        self.session.refresh(delivery)
        self.assertEqual((delivery.status, delivery.attempts), ("delivered", 1))
        self.assertIsNotNone(delivery.delivered_at)
        self.assertIsNone(worker.claim_next_webhook(self.database))

    def test_missing_key_is_not_reconstructed_and_failure_is_bounded(self):
        _, delivery = self.make_delivery(secret=None)
        claim = worker.claim_next_webhook(self.database)
        self.assertEqual(claim, ("d", 1))
        with patch("backend.app.worker.send_webhook", side_effect=AssertionError("Missing key must not send")) as send:
            worker.process_webhook(self.database, *claim)
            send.assert_not_called()
        self.session.refresh(delivery)
        self.assertEqual((delivery.status, delivery.last_error), ("failed", "webhook_signing_secret_missing"))
        self.assertIsNone(worker.claim_next_webhook(self.database))
        delivery.updated_at = utcnow() - timedelta(seconds=301)
        delivery.attempts = 5
        self.session.commit()
        self.assertIsNone(worker.claim_next_webhook(self.database))

    def test_revocation_after_claim_blocks_send_and_errors_are_redacted(self):
        subscription, delivery = self.make_delivery()
        claim = worker.claim_next_webhook(self.database)
        subscription.status = "revoked"
        self.session.commit()
        with patch("backend.app.worker.send_webhook") as send:
            worker.process_webhook(self.database, *claim)
            send.assert_not_called()
        self.session.refresh(delivery)
        self.assertEqual(delivery.status, "cancelled")
        subscription.status = "active"
        delivery.status = "sending"
        self.session.commit()
        with patch("backend.app.worker.send_webhook", side_effect=RuntimeError("synthetic-private-provider-detail")):
            worker.process_webhook(self.database, *claim)
        self.session.refresh(delivery)
        self.assertEqual(delivery.last_error, "webhook_delivery_failed")

    def test_agents_only_never_claims_webhooks_and_document_drain_exits(self):
        with ExitStack() as stack:
            for name in ("expire_agent_runs", "purge_expired_context"):
                stack.enter_context(patch("backend.app.worker." + name, return_value=0))
            for name in ("recover_workflow_graphs", "purge_expired_contracts", "process_lifecycle_reminders"):
                stack.enter_context(patch("backend.app.worker." + name))
            for name in ("claim_next_hosted_task", "claim_next_agent_action", "claim_next_job", "claim_next_email"):
                stack.enter_context(patch("backend.app.worker." + name, return_value=None))
            stack.enter_context(patch("backend.app.worker.build_object_store", return_value=MagicMock()))
            with patch("backend.app.worker.claim_next_webhook", side_effect=AssertionError("Agent lane cannot send webhooks")):
                worker.run_worker(self.settings, once=True, agents_only=True)
            with patch("backend.app.worker.claim_next_webhook", side_effect=[("synthetic", 3), None]) as claim, \
                 patch("backend.app.worker.process_webhook") as process:
                worker.run_worker(self.settings, drain=True, documents_only=True,
                    review_workflow_factory=lambda: (_ for _ in ()).throw(AssertionError("No model initialization")))
                self.assertEqual(claim.call_count, 2)
                process.assert_called_once_with(ANY, "synthetic", 3)

    def age_webhook_claim(self):
        # Independent real SQL session models a sender stalled beyond backoff.
        with self.database.session_factory() as session:
            delivery = session.get(WebhookDelivery, "d")
            delivery.updated_at = utcnow() - timedelta(seconds=301)
            session.commit()

    def webhook_state(self):
        with self.database.session_factory() as session:
            delivery = session.get(WebhookDelivery, "d")
            subscription = session.get(WebhookSubscription, "w")
            return (delivery.status, delivery.attempts, delivery.last_error,
                    delivery.delivered_at, delivery.updated_at, subscription.last_delivery_at)

    def test_newer_success_survives_older_failure_with_real_sql_sessions(self):
        self.make_delivery()
        old_claim = worker.claim_next_webhook(self.database)
        terminal = []
        claims, requests = [], []

        def stalled_sender(*args):
            self.age_webhook_claim()
            new_claim = worker.claim_next_webhook(self.database)
            claims.append(new_claim)
            with patch("backend.app.worker.send_webhook", return_value=204) as newer_send:
                worker.process_webhook(self.database, *new_claim)
            requests.append((args, newer_send.call_args_list))
            terminal.append(self.webhook_state())
            raise TimeoutError("synthetic older response lost")

        with patch("backend.app.worker.send_webhook", side_effect=stalled_sender):
            worker.process_webhook(self.database, *old_claim)
        self.assertEqual((old_claim, claims), (("d", 1), [("d", 2)]))
        self.assertEqual(len(requests), 1)
        self.assertEqual(requests[0][1], [call(*requests[0][0])])
        self.assertEqual(terminal[0][:3], ("delivered", 2, ""))
        self.assertEqual(self.webhook_state(), terminal[0])
        self.assertIsNone(worker.claim_next_webhook(self.database))

    def test_newer_failure_survives_older_success_with_real_sql_sessions(self):
        self.make_delivery()
        old_claim = worker.claim_next_webhook(self.database)
        terminal = []
        claims, requests = [], []

        def stalled_sender(*args):
            self.age_webhook_claim()
            new_claim = worker.claim_next_webhook(self.database)
            claims.append(new_claim)
            with patch("backend.app.worker.send_webhook", side_effect=TimeoutError("synthetic newer response lost")) as newer_send:
                worker.process_webhook(self.database, *new_claim)
            requests.append((args, newer_send.call_args_list))
            terminal.append(self.webhook_state())
            return 204

        with patch("backend.app.worker.send_webhook", side_effect=stalled_sender):
            worker.process_webhook(self.database, *old_claim)
        self.assertEqual((old_claim, claims), (("d", 1), [("d", 2)]))
        self.assertEqual(len(requests), 1)
        self.assertEqual(requests[0][1], [call(*requests[0][0])])
        self.assertEqual(terminal[0][:3], ("failed", 2, "webhook_delivery_failed"))
        self.assertIsNone(terminal[0][3])
        self.assertIsNone(terminal[0][5])
        self.assertEqual(self.webhook_state(), terminal[0])
        self.assertIsNone(worker.claim_next_webhook(self.database))  # Backoff still applies.

    def assert_old_result_preserves_new_sending_claim(self, old_succeeds):
        self.make_delivery()
        old_claim = worker.claim_next_webhook(self.database)
        newer_claims, sending_states = [], []

        def stalled_sender(*args):
            self.age_webhook_claim()
            newer_claims.append(worker.claim_next_webhook(self.database))
            sending_states.append(self.webhook_state())
            if old_succeeds:
                return 204
            raise TimeoutError("synthetic old attempt timed out while replacement in flight")

        with patch("backend.app.worker.send_webhook", side_effect=stalled_sender):
            worker.process_webhook(self.database, *old_claim)
        self.assertEqual(newer_claims, [("d", 2)])
        self.assertEqual(sending_states[0][:2], ("sending", 2))
        self.assertEqual(self.webhook_state(), sending_states[0])
        with patch("backend.app.worker.send_webhook", return_value=204) as send:
            worker.process_webhook(self.database, *newer_claims[0])
        send.assert_called_once()
        self.assertEqual(self.webhook_state()[:3], ("delivered", 2, ""))

    def test_old_success_cannot_complete_a_newer_sending_claim(self):
        self.assert_old_result_preserves_new_sending_claim(old_succeeds=True)

    def test_old_failure_cannot_fail_a_newer_sending_claim(self):
        self.assert_old_result_preserves_new_sending_claim(old_succeeds=False)

    def test_stale_claim_never_reaches_post_even_while_new_attempt_is_sending(self):
        self.make_delivery()
        old_claim = worker.claim_next_webhook(self.database)
        self.age_webhook_claim()
        new_claim = worker.claim_next_webhook(self.database)
        self.assertEqual(new_claim, ("d", 2))
        before = self.webhook_state()
        with patch("backend.app.worker.send_webhook") as send:
            worker.process_webhook(self.database, *old_claim)
            for invalid in (0, -1, True, "2", 6):
                worker.process_webhook(self.database, "d", invalid)
            send.assert_not_called()
        self.assertEqual(self.webhook_state(), before)
        with patch("backend.app.worker.send_webhook", return_value=204):
            worker.process_webhook(self.database, *new_claim)
        completed = self.webhook_state()
        with patch("backend.app.worker.send_webhook") as send:
            worker.process_webhook(self.database, *old_claim)
            worker.process_webhook(self.database, *new_claim)
            send.assert_not_called()
        self.assertEqual(self.webhook_state(), completed)

    def test_response_loss_retries_same_id_body_at_most_five_times_after_backoff(self):
        self.make_delivery()
        calls = []

        def response_lost(*args):
            calls.append(args)
            raise TimeoutError("synthetic external effect may have happened")

        for attempt in range(1, 6):
            claim = worker.claim_next_webhook(self.database)
            self.assertEqual(claim, ("d", attempt))
            with patch("backend.app.worker.send_webhook", side_effect=response_lost):
                worker.process_webhook(self.database, *claim)
            self.assertEqual(self.webhook_state()[:3], ("failed", attempt, "webhook_delivery_failed"))
            self.assertIsNone(worker.claim_next_webhook(self.database))
            self.age_webhook_claim()
        self.assertEqual(len(calls), 5)
        self.assertTrue(all(args == calls[0] for args in calls))
        self.assertIsNone(worker.claim_next_webhook(self.database))

    def test_competing_claim_compare_and_swap_does_not_issue_same_attempt_twice(self):
        self.make_delivery()
        factory = self.database.session_factory
        other_claim = []

        class InterleavingSession:
            def __enter__(inner):
                inner.session = factory()
                return inner

            def __exit__(inner, *args):
                inner.session.close()

            def scalar(inner, statement):
                row = inner.session.scalar(statement)
                # Both read attempt 0; competing claimer commits attempt 1 first.
                with patch.object(self.database, "session_factory", factory):
                    other_claim.append(worker.claim_next_webhook(self.database))
                return row

            def execute(inner, *args, **kwargs):
                return inner.session.execute(*args, **kwargs)

            def commit(inner):
                inner.session.commit()

        with patch.object(self.database, "session_factory", InterleavingSession):
            self.assertIsNone(worker.claim_next_webhook(self.database))
        self.assertEqual(other_claim, [("d", 1)])
        self.assertEqual(self.webhook_state()[:2], ("sending", 1))


class WebhookWireTests(unittest.TestCase):
    def test_historical_signature_is_timestamp_dot_exact_body(self):
        body = b'{"x":"synthetic"}'
        expected = hmac.new(b"synthetic-key", b"123." + body, hashlib.sha256).hexdigest()
        self.assertEqual(outbound.signature("synthetic-key", 123, body), "t=123,v1=" + expected)
        self.assertNotEqual(outbound.signature("synthetic-key", 123, body), outbound.signature("synthetic-key", 123, body + b" "))

    def test_send_resolves_once_pins_public_address_and_uses_no_response_body(self):
        with patch.object(outbound.socket, "getaddrinfo", return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 443))]) as dns, \
             patch.object(outbound, "_PinnedHTTPSConnection") as factory, patch.object(outbound.time, "time", return_value=123):
            connection = factory.return_value
            connection.getresponse.return_value.status = 204
            self.assertEqual(outbound.send_webhook("https://hooks.example.test/a?b=1", "synthetic-key", "contract.created", "d", b"{}"), 204)
            dns.assert_called_once()
            factory.assert_called_once_with("hooks.example.test", 443, "8.8.8.8")
            args, kwargs = connection.request.call_args
            self.assertEqual(args, ("POST", "/a?b=1"))
            self.assertEqual(kwargs["body"], b"{}")
            self.assertEqual(kwargs["headers"][outbound.SIGNATURE_HEADER], outbound.signature("synthetic-key", 123, b"{}"))
            connection.getresponse.return_value.read.assert_not_called()
            connection.close.assert_called_once()

    def test_actual_connect_uses_checked_ip_but_original_tls_hostname(self):
        connection = object.__new__(outbound._PinnedHTTPSConnection)
        connection._address, connection.host, connection.port, connection.timeout = "8.8.8.8", "hooks.example.test", 443, 10
        connection._context = MagicMock()
        with patch.object(outbound.socket, "create_connection") as dial:
            connection.connect()
            dial.assert_called_once_with(("8.8.8.8", 443), 10)
            connection._context.wrap_socket.assert_called_once_with(dial.return_value, server_hostname="hooks.example.test")

    def test_bad_urls_and_private_or_mixed_dns_fail_before_connection(self):
        for url in ("http://hooks.example.test", "https://user:synthetic@hooks.example.test", "https://hooks.example.test/#fragment", "https://hooks.example.test/\n"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                outbound.send_webhook(url, "synthetic", "event", "d", b"{}")
        for addresses in ([], ["127.0.0.1"], ["169.254.169.254"], ["8.8.8.8", "10.0.0.1"], ["::1"]):
            with self.subTest(addresses=addresses), patch.object(outbound.socket, "getaddrinfo", return_value=[
                    (socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 443)) for ip in addresses]), \
                 patch.object(outbound, "_PinnedHTTPSConnection") as connection:
                with self.assertRaises(ValueError):
                    outbound.send_webhook("https://hooks.example.test", "synthetic", "event", "d", b"{}")
                connection.assert_not_called()

    def test_redirect_is_not_followed_and_connection_closes_on_error(self):
        with patch.object(outbound.socket, "getaddrinfo", return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 443))]), \
             patch.object(outbound, "_PinnedHTTPSConnection") as factory:
            factory.return_value.getresponse.return_value.status = 302
            with self.assertRaises(ValueError):
                outbound.send_webhook("https://hooks.example.test", "synthetic", "event", "d", b"{}")
            factory.return_value.request.assert_called_once()
            factory.return_value.close.assert_called_once()
