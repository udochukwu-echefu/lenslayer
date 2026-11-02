import tempfile
import unittest
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app.agent_models import AgentPrincipal
from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.models import Membership, Organization, PlatformAuditEvent, PublicApiKey, User, utcnow
from sqlalchemy import select


class AccountDeletionTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.root = Path(self.tempdir.name)
        self.settings = Settings(_env_file=None, environment="test", database_url=f"sqlite:///{self.root / 'platform.db'}",
                                 object_storage_root=self.root / "objects", auto_create_schema=True, auth_mode="local")
        self.app = create_app(self.settings)
        self.context = TestClient(self.app)
        self.client = self.context.__enter__()
        self.database = self.app.state.database
        self.alice = {"X-LensLayer-User": "alice", "X-LensLayer-Email": "alice@example.com", "X-LensLayer-Name": "Alice"}
        self.bob = {"X-LensLayer-User": "bob", "X-LensLayer-Email": "bob@example.com", "X-LensLayer-Name": "Bob"}

    def tearDown(self):
        self.context.__exit__(None, None, None)
        self.tempdir.cleanup()

    def workspace(self, headers, slug):
        response = self.client.post("/api/v1/organizations", headers=headers, json={"name": slug.title(), "slug": slug})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def join(self, organization_id, headers, role):
        user_id = self.client.get("/api/v1/me", headers=headers).json()["id"]
        with self.database.session_factory() as session:
            session.add(Membership(organization_id=organization_id, user_id=user_id, role=role))
            session.commit()
        return user_id

    def upload(self, organization_id, headers, **fields):
        response = self.client.post(
            f"/api/v1/organizations/{organization_id}/contracts", headers=headers,
            data={"title": "Lease", "counterparty": "Landlord", "party_role": "Tenant", "retention_days": "30", **fields},
            files={"file": ("lease.txt", b"Lease\nRent is due monthly.", "text/plain")},
        )
        self.assertEqual(response.status_code, 202, response.text)
        return response.json()["contract"]["id"]

    def delete(self, headers, confirmation="DELETE"):
        return self.client.post("/api/v1/me/deletion", headers=headers, json={"confirmation": confirmation})

    def stored_files(self):
        return [path for path in (self.root / "objects").rglob("*") if path.is_file()]

    def test_personal_workspace_and_its_files_are_deleted(self):
        organization_id = self.workspace(self.alice, "personal")
        self.upload(organization_id, self.alice, retain_document="true")
        self.assertTrue(self.stored_files())
        user_id = self.client.get("/api/v1/me", headers=self.alice).json()["id"]

        response = self.delete(self.alice)

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {"deleted_workspaces": 1, "left_workspaces": 0, "identity_removed": False})
        self.assertEqual(self.stored_files(), [])
        with self.database.session_factory() as session:
            self.assertIsNone(session.get(Organization, organization_id))
            user = session.get(User, user_id)
            self.assertEqual((user.email, user.display_name, user.external_subject), ("", "", f"deleted:{user_id}"))
        # Signing in again with the same login starts from an empty account.
        fresh = self.client.get("/api/v1/me", headers=self.alice).json()
        self.assertNotEqual(fresh["id"], user_id)
        self.assertEqual(self.client.get("/api/v1/organizations", headers=self.alice).json(), [])

    def test_wrong_confirmation_changes_nothing(self):
        organization_id = self.workspace(self.alice, "personal")
        response = self.delete(self.alice, "delete")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.get("/api/v1/me", headers=self.alice).json()["email"], "alice@example.com")
        with self.database.session_factory() as session:
            self.assertIsNotNone(session.get(Organization, organization_id))

    def test_last_owner_of_a_shared_workspace_is_asked_to_hand_over_first(self):
        organization_id = self.workspace(self.alice, "shared-team")
        self.join(organization_id, self.bob, "reviewer")

        preview = self.client.get("/api/v1/me/deletion", headers=self.alice)
        self.assertEqual(preview.json(), {"blocking_workspaces": ["Shared-Team"]})
        response = self.delete(self.alice)

        self.assertEqual(response.status_code, 409)
        self.assertIn("Shared-Team", response.json()["detail"])
        self.assertEqual(self.client.get("/api/v1/me", headers=self.alice).json()["email"], "alice@example.com")

    def test_leaving_a_shared_workspace_revokes_credentials_and_keeps_its_history(self):
        organization_id = self.workspace(self.alice, "shared-team")
        bob_id = self.join(organization_id, self.bob, "admin")
        base = f"/api/v1/organizations/{organization_id}"
        api_key = self.client.post(base + "/api-keys", headers=self.bob,
                                   json={"name": "Intake", "scopes": ["contracts:read"]})
        self.assertEqual(api_key.status_code, 201, api_key.text)
        alice_id = self.client.get("/api/v1/me", headers=self.alice).json()["id"]
        contract_id = self.upload(organization_id, self.alice)
        agent = self.client.post(base + "/agents", headers=self.bob, json={
            "name": "Bob's agent", "allowed_tools": ["documents.retrieve"], "contract_ids": [contract_id], "assignee_ids": [alice_id],
            "require_approval": True, "expires_at": (utcnow() + timedelta(days=7)).isoformat(), "max_actions_per_run": 1,
        })
        self.assertEqual(agent.status_code, 201, agent.text)

        public_url = f"/api/v1/public/contracts/{contract_id}"
        key_headers = {"Authorization": f"Bearer {api_key.json()['token']}"}
        self.assertEqual(self.client.get(public_url, headers=key_headers).status_code, 200)

        response = self.delete(self.bob)

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["left_workspaces"], 1)
        self.assertEqual(self.client.get(base + "/members", headers=self.alice).status_code, 200)
        self.assertEqual(len(self.client.get(base + "/members", headers=self.alice).json()), 1)
        self.assertEqual(self.client.get(public_url, headers=key_headers).status_code, 401)
        with self.database.session_factory() as session:
            self.assertIsNotNone(session.scalar(select(PublicApiKey.revoked_at)))
            self.assertIsNotNone(session.scalar(select(AgentPrincipal.revoked_at)))
            self.assertEqual(session.get(User, bob_id).email, "")
            actions = session.scalars(select(PlatformAuditEvent.action).where(
                PlatformAuditEvent.organization_id == organization_id)).all()
            self.assertIn("membership.account_deleted", actions)

    def test_auth0_identity_is_removed_when_management_access_is_configured(self):
        from backend.app import identity_provider

        settings = self.settings.model_copy(update={
            "auth_mode": "oidc", "auth0_management_domain": "tenant.eu.auth0.com",
            "auth0_management_client_id": "client", "auth0_management_client_secret": "secret",
        })
        calls = []

        class FakeClient:
            def __init__(self, base_url, timeout):
                calls.append(("base", base_url))

            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

            def post(self, path, json):
                calls.append(("token", json["audience"]))
                import httpx
                return httpx.Response(200, json={"access_token": "mgmt"}, request=httpx.Request("POST", path))

            def delete(self, path, headers):
                calls.append(("delete", path, headers["Authorization"]))
                import httpx
                return httpx.Response(204, request=httpx.Request("DELETE", path))

        with patch.object(identity_provider.httpx, "Client", FakeClient):
            self.assertTrue(identity_provider.delete_identity(settings, "google-oauth2|123"))
        self.assertEqual(calls, [
            ("base", "https://tenant.eu.auth0.com"),
            ("token", "https://tenant.eu.auth0.com/api/v2/"),
            ("delete", "/api/v2/users/google-oauth2%7C123", "Bearer mgmt"),
        ])
        self.assertFalse(identity_provider.delete_identity(self.settings, "alice"))


if __name__ == "__main__":
    unittest.main()
