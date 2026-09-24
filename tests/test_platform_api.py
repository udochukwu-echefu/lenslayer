import tempfile
import unittest
import io
import zipfile
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from docx import Document

from backend.app.config import Settings
from backend.app.document_intelligence import build_review_workflow
from backend.app.main import create_app
from backend.app.models import Contract, utcnow
from backend.app.worker import run_worker


class PlatformApiTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        root = Path(self.tempdir.name)
        self.settings = Settings(
            _env_file=None,
            environment="test",
            database_url=f"sqlite:///{root / 'platform.db'}",
            object_storage_root=root / "objects",
            auto_create_schema=True,
            auth_mode="local",
        )
        self.client_context = TestClient(create_app(self.settings))
        self.client = self.client_context.__enter__()
        self.alice = {
            "X-LensLayer-User": "alice",
            "X-LensLayer-Email": "alice@example.com",
            "X-LensLayer-Name": "Alice",
        }
        self.bob = {
            "X-LensLayer-User": "bob",
            "X-LensLayer-Email": "bob@example.com",
            "X-LensLayer-Name": "Bob",
        }
        self.carol = {
            "X-LensLayer-User": "carol",
            "X-LensLayer-Email": "carol@example.com",
            "X-LensLayer-Name": "Carol",
        }

    def run_worker_with_report(self, report):
        run_worker(
            self.settings,
            once=True,
            review_workflow_factory=lambda: build_review_workflow(
                contract_analyzer=lambda _text, _context: report,
            ),
        )
    def tearDown(self):
        self.client_context.__exit__(None, None, None)
        self.tempdir.cleanup()

    def create_organization(self):
        response = self.client.post(
            "/api/v1/organizations",
            headers=self.alice,
            json={"name": "Acme Operations", "slug": "acme-operations"},
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def upload_contract(self, organization_id, **overrides):
        data = {
            "title": "Supplier Agreement",
            "counterparty": "Example Supplier",
            "party_role": "Customer",
            "retention_days": "30",
            **overrides,
        }
        return self.client.post(
            f"/api/v1/organizations/{organization_id}/contracts",
            headers=self.alice,
            data=data,
            files={"file": ("supplier.txt", b"Agreement\nThe customer must pay within 30 days.", "text/plain")},
        )

    def invite(self, organization_id, email, role="reviewer", headers=None):
        return self.client.post(
            f"/api/v1/organizations/{organization_id}/invitations",
            headers=headers or self.alice,
            json={"email": email, "role": role},
        )

    def accept(self, token, headers):
        return self.client.post(f"/api/v1/invitations/{token}/accept", headers=headers)

    def test_health_identity_and_organization_bootstrap(self):
        self.assertEqual(self.client.get("/health/live").json()["status"], "ok")
        self.assertEqual(self.client.get("/health/ready").json()["status"], "ready")
        self.assertEqual(self.client.get("/api/v1/me", headers=self.alice).json()["email"], "alice@example.com")
        organization = self.create_organization()
        listed = self.client.get("/api/v1/organizations", headers=self.alice).json()
        self.assertEqual(listed[0]["id"], organization["id"])
        self.assertEqual(listed[0]["role"], "owner")

    def test_app_composition_root_accepts_review_workflow_factory(self):
        calls = []

        def factory():
            calls.append(True)
            return build_review_workflow(contract_analyzer=lambda _text, _context: {})

        with TestClient(create_app(self.settings, review_workflow_factory=factory)) as client:
            self.assertEqual(client.get("/health/live").status_code, 200)

        self.assertEqual(calls, [True])

    def test_upload_and_import_start_worker_after_queueing(self):
        organization = self.create_organization()
        self.settings.review_worker_job = "projects/lenslayer/locations/europe-west1/jobs/lenslayer-review-worker"
        with patch("backend.app.review_trigger.trigger_review_worker") as trigger:
            uploaded = self.upload_contract(organization["id"])
            self.assertEqual(uploaded.status_code, 202, uploaded.text)
            imported = self.client.post(
                f"/api/v1/organizations/{organization['id']}/intake/email",
                headers=self.alice,
                data={"external_id": "mail-trigger-check"},
                files={"file": ("imported.txt", b"Review this agreement.", "text/plain")},
            )
            self.assertEqual(imported.status_code, 202, imported.text)
            api_key = self.client.post(
                f"/api/v1/organizations/{organization['id']}/api-keys",
                headers=self.alice,
                json={"name": "Trigger test", "scopes": ["contracts:write"]},
            )
            self.assertEqual(api_key.status_code, 201, api_key.text)
            public_upload = self.client.post(
                "/api/v1/public/contracts",
                headers={"Authorization": f"Bearer {api_key.json()['token']}"},
                data={"external_id": "public-trigger-check"},
                files={"file": ("public.txt", b"Review this contract.", "text/plain")},
            )
            self.assertEqual(public_upload.status_code, 202, public_upload.text)
        self.assertEqual(trigger.call_count, 3)

    def test_contract_upload_is_queued_and_scoped_to_the_organization(self):
        organization = self.create_organization()
        response = self.upload_contract(organization["id"])
        self.assertEqual(response.status_code, 202, response.text)
        payload = response.json()
        self.assertEqual(payload["contract"]["status"], "processing")
        self.assertEqual(payload["job"]["status"], "queued")
        self.assertEqual(payload["asset"]["size_bytes"], len(b"Agreement\nThe customer must pay within 30 days."))
        object_files = [item for item in self.settings.object_storage_root.rglob("*") if item.is_file()]
        self.assertEqual(len(object_files), 1)

        forbidden = self.client.get(
            f"/api/v1/organizations/{organization['id']}/contracts",
            headers=self.bob,
        )
        self.assertEqual(forbidden.status_code, 403)

    def test_worker_persists_review_and_removes_non_retained_document(self):
        organization = self.create_organization()
        created = self.upload_contract(organization["id"]).json()
        report = {
            "title": "Supplier Agreement",
            "contract_type": "Services",
            "overall_attention": "Medium",
            "risk_assessment": [],
        }
        self.run_worker_with_report(report)
        contract_id = created["contract"]["id"]
        contract = self.client.get(
            f"/api/v1/organizations/{organization['id']}/contracts/{contract_id}",
            headers=self.alice,
        ).json()
        self.assertEqual(contract["status"], "ready")
        review_response = self.client.get(
            f"/api/v1/organizations/{organization['id']}/contracts/{contract_id}/review",
            headers=self.alice,
        )
        self.assertEqual(review_response.status_code, 200, review_response.text)
        self.assertEqual(review_response.json()["analysis"]["contract_type"], "Services")
        self.assertFalse(review_response.json()["source_text_retained"])
        self.assertFalse(any(item.is_file() for item in self.settings.object_storage_root.rglob("*")))

    def test_upload_validation_and_hard_delete(self):
        organization = self.create_organization()
        invalid = self.client.post(
            f"/api/v1/organizations/{organization['id']}/contracts",
            headers=self.alice,
            files={"file": ("malware.exe", b"not allowed", "application/octet-stream")},
        )
        self.assertEqual(invalid.status_code, 415)

        created = self.upload_contract(organization["id"], retain_document="true").json()
        contract_id = created["contract"]["id"]
        deleted = self.client.delete(
            f"/api/v1/organizations/{organization['id']}/contracts/{contract_id}",
            headers=self.alice,
        )
        self.assertEqual(deleted.status_code, 204)
        self.assertEqual(
            self.client.get(
                f"/api/v1/organizations/{organization['id']}/contracts/{contract_id}",
                headers=self.alice,
            ).status_code,
            404,
        )
        self.assertFalse(any(item.is_file() for item in self.settings.object_storage_root.rglob("*")))
        audit = self.client.get(
            f"/api/v1/organizations/{organization['id']}/audit-events",
            headers=self.alice,
        ).json()
        self.assertIn("contract.deleted", {item["action"] for item in audit})

    def test_malware_signature_is_rejected_before_storage(self):
        organization = self.create_organization()
        response = self.client.post(
            f"/api/v1/organizations/{organization['id']}/contracts",
            headers=self.alice,
            files={
                "file": (
                    "unsafe.txt",
                    b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
                    "text/plain",
                )
            },
        )
        self.assertEqual(response.status_code, 422, response.text)
        self.assertFalse(any(item.is_file() for item in self.settings.object_storage_root.rglob("*")))

    def test_deal_passport_and_tracked_change_redline(self):
        organization = self.create_organization()
        source = io.BytesIO()
        document = Document()
        document.add_paragraph("Supplier may revise the Charges from time to time by written notice.")
        document.save(source)
        created_response = self.client.post(
            f"/api/v1/organizations/{organization['id']}/contracts",
            headers=self.alice,
            data={"title": "Supplier Agreement", "retain_document": "true", "retain_source_text": "true"},
            files={
                "file": (
                    "supplier.docx",
                    source.getvalue(),
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                )
            },
        )
        self.assertEqual(created_response.status_code, 202, created_response.text)
        contract_id = created_response.json()["contract"]["id"]
        report = {
            "title": "Supplier Agreement",
            "contract_type": "Services",
            "executive_summary": "A supplier agreement with one material pricing issue.",
            "overall_attention": "High",
            "risk_assessment": [{
                "title": "One-sided price changes",
                "risk_level": "High",
                "clause": "Supplier may revise the Charges from time to time by written notice.",
                "explanation": "The customer has no exit right.",
                "recommendation": "Require notice and a cancellation right.",
                "suggested_language": "Supplier may revise Charges on 30 days' notice; Customer may terminate before the change.",
                "citation": "Section 4.2",
            }],
        }
        self.run_worker_with_report(report)
        passport = self.client.get(
            f"/api/v1/organizations/{organization['id']}/contracts/{contract_id}/deal-passport",
            headers=self.alice,
        )
        self.assertEqual(passport.status_code, 200, passport.text)
        self.assertEqual(passport.json()["readiness"], "needs_attention")
        self.assertEqual(passport.json()["top_risks"][0]["title"], "One-sided price changes")
        redline = self.client.get(
            f"/api/v1/organizations/{organization['id']}/contracts/{contract_id}/redline.docx",
            headers=self.alice,
        )
        self.assertEqual(redline.status_code, 200, redline.text)
        with zipfile.ZipFile(io.BytesIO(redline.content)) as archive:
            document_xml = archive.read("word/document.xml")
            self.assertIn(b"<w:del ", document_xml)
            self.assertIn(b"<w:ins ", document_xml)
            self.assertIn("word/comments.xml", archive.namelist())
    def test_worker_purges_expired_contracts_and_documents(self):
        organization = self.create_organization()
        created = self.upload_contract(organization["id"], retain_document="true").json()
        database = self.client.app.state.database
        with database.session_factory() as session:
            contract = session.get(Contract, created["contract"]["id"])
            contract.expires_at = utcnow() - timedelta(seconds=1)
            session.commit()

        run_worker(self.settings, once=True)
        response = self.client.get(
            f"/api/v1/organizations/{organization['id']}/contracts/{created['contract']['id']}",
            headers=self.alice,
        )
        self.assertEqual(response.status_code, 404)
        self.assertFalse(any(item.is_file() for item in self.settings.object_storage_root.rglob("*")))
        audit = self.client.get(
            f"/api/v1/organizations/{organization['id']}/audit-events",
            headers=self.alice,
        ).json()
        self.assertIn("contract.expired", {item["action"] for item in audit})

    def test_invitation_is_email_bound_and_creates_membership(self):
        organization = self.create_organization()
        invitation_response = self.invite(organization["id"], "Bob@Example.com")
        self.assertEqual(invitation_response.status_code, 201, invitation_response.text)
        created = invitation_response.json()
        token = created["token"]
        self.assertEqual(created["invitation"]["email"], "bob@example.com")
        self.assertEqual(created["invitation"]["status"], "pending")

        preview = self.client.get(f"/api/v1/invitations/{token}")
        self.assertEqual(preview.status_code, 200, preview.text)
        self.assertEqual(preview.json()["organization_name"], "Acme Operations")
        self.assertNotIn("bob@example.com", preview.text)

        wrong_identity = self.accept(token, self.carol)
        self.assertEqual(wrong_identity.status_code, 403)
        accepted = self.accept(token, self.bob)
        self.assertEqual(accepted.status_code, 200, accepted.text)
        self.assertEqual(accepted.json()["membership"]["role"], "reviewer")

        listed = self.client.get(
            f"/api/v1/organizations/{organization['id']}/invitations",
            headers=self.alice,
        )
        self.assertNotIn(token, listed.text)
        self.assertEqual(listed.json()[0]["status"], "accepted")
        members = self.client.get(
            f"/api/v1/organizations/{organization['id']}/members",
            headers=self.bob,
        ).json()
        self.assertEqual({item["email"] for item in members}, {"alice@example.com", "bob@example.com"})

        audit = self.client.get(
            f"/api/v1/organizations/{organization['id']}/audit-events",
            headers=self.alice,
        ).json()
        actions = {item["action"] for item in audit}
        self.assertIn("invitation.created", actions)
        self.assertIn("invitation.accepted", actions)

    def test_role_permissions_and_last_owner_protection(self):
        organization = self.create_organization()
        viewer_invite = self.invite(organization["id"], "bob@example.com", "viewer").json()
        self.assertEqual(self.accept(viewer_invite["token"], self.bob).status_code, 200)

        viewer_upload = self.client.post(
            f"/api/v1/organizations/{organization['id']}/contracts",
            headers=self.bob,
            files={"file": ("read-only.txt", b"A contract", "text/plain")},
        )
        self.assertEqual(viewer_upload.status_code, 403)

        members = self.client.get(
            f"/api/v1/organizations/{organization['id']}/members",
            headers=self.alice,
        ).json()
        owner = next(item for item in members if item["role"] == "owner")
        viewer = next(item for item in members if item["role"] == "viewer")
        last_owner = self.client.patch(
            f"/api/v1/organizations/{organization['id']}/members/{owner['id']}",
            headers=self.alice,
            json={"role": "admin"},
        )
        self.assertEqual(last_owner.status_code, 409)

        promoted = self.client.patch(
            f"/api/v1/organizations/{organization['id']}/members/{viewer['id']}",
            headers=self.alice,
            json={"role": "reviewer"},
        )
        self.assertEqual(promoted.status_code, 200, promoted.text)
        reviewer_upload = self.client.post(
            f"/api/v1/organizations/{organization['id']}/contracts",
            headers=self.bob,
            files={"file": ("review.txt", b"A contract", "text/plain")},
        )
        self.assertEqual(reviewer_upload.status_code, 202, reviewer_upload.text)

    def test_admin_scope_and_invitation_revocation(self):
        organization = self.create_organization()
        admin_invite = self.invite(organization["id"], "carol@example.com", "admin").json()
        self.assertEqual(self.accept(admin_invite["token"], self.carol).status_code, 200)

        forbidden_admin_invite = self.invite(
            organization["id"],
            "another-admin@example.com",
            "admin",
            self.carol,
        )
        self.assertEqual(forbidden_admin_invite.status_code, 403)
        reviewer_invite = self.invite(
            organization["id"],
            "reviewer@example.com",
            "reviewer",
            self.carol,
        )
        self.assertEqual(reviewer_invite.status_code, 201, reviewer_invite.text)
        invite_id = reviewer_invite.json()["invitation"]["id"]
        token = reviewer_invite.json()["token"]
        revoked = self.client.delete(
            f"/api/v1/organizations/{organization['id']}/invitations/{invite_id}",
            headers=self.carol,
        )
        self.assertEqual(revoked.status_code, 204, revoked.text)
        self.assertEqual(self.client.get(f"/api/v1/invitations/{token}").json()["status"], "revoked")
        rejected = self.client.post(
            f"/api/v1/invitations/{token}/accept",
            headers={
                "X-LensLayer-User": "reviewer",
                "X-LensLayer-Email": "reviewer@example.com",
            },
        )
        self.assertEqual(rejected.status_code, 410)

    def test_task_lifecycle_assignment_permissions_and_audit(self):
        organization = self.create_organization()
        reviewer_invite = self.invite(organization["id"], "bob@example.com", "reviewer").json()
        self.assertEqual(self.accept(reviewer_invite["token"], self.bob).status_code, 200)
        viewer_invite = self.invite(organization["id"], "carol@example.com", "viewer").json()
        self.assertEqual(self.accept(viewer_invite["token"], self.carol).status_code, 200)
        contract = self.upload_contract(organization["id"]).json()["contract"]
        members = self.client.get(
            f"/api/v1/organizations/{organization['id']}/members",
            headers=self.alice,
        ).json()
        bob = next(item for item in members if item["email"] == "bob@example.com")

        created_response = self.client.post(
            f"/api/v1/organizations/{organization['id']}/tasks",
            headers=self.bob,
            json={
                "title": "Confirm the renewal notice window",
                "description": "Check the clause against the operating calendar.",
                "contract_id": contract["id"],
                "assigned_to_user_id": bob["user_id"],
                "category": "deadline",
                "priority": "high",
                "due_at": "2026-08-05T09:00:00Z",
                "source_kind": "finding",
                "source_reference": {"finding_index": 2, "section": "Renewal"},
            },
        )
        self.assertEqual(created_response.status_code, 201, created_response.text)
        task = created_response.json()
        self.assertEqual(task["assigned_to_email"], "bob@example.com")
        self.assertEqual(task["contract_title"], "Supplier Agreement")
        self.assertEqual(task["source_reference"]["section"], "Renewal")

        visible_to_viewer = self.client.get(
            f"/api/v1/organizations/{organization['id']}/tasks",
            headers=self.carol,
        )
        self.assertEqual(visible_to_viewer.status_code, 200, visible_to_viewer.text)
        viewer_create = self.client.post(
            f"/api/v1/organizations/{organization['id']}/tasks",
            headers=self.carol,
            json={"title": "Viewer cannot create"},
        )
        self.assertEqual(viewer_create.status_code, 403)
        viewer_update = self.client.patch(
            f"/api/v1/organizations/{organization['id']}/tasks/{task['id']}",
            headers=self.carol,
            json={"status": "done"},
        )
        self.assertEqual(viewer_update.status_code, 403)

        completed = self.client.patch(
            f"/api/v1/organizations/{organization['id']}/tasks/{task['id']}",
            headers=self.bob,
            json={"status": "done"},
        )
        self.assertEqual(completed.status_code, 200, completed.text)
        self.assertEqual(completed.json()["status"], "done")
        self.assertIsNotNone(completed.json()["completed_at"])

        owner_task = self.client.post(
            f"/api/v1/organizations/{organization['id']}/tasks",
            headers=self.alice,
            json={"title": "Owner-created action"},
        ).json()
        reviewer_delete_other = self.client.delete(
            f"/api/v1/organizations/{organization['id']}/tasks/{owner_task['id']}",
            headers=self.bob,
        )
        self.assertEqual(reviewer_delete_other.status_code, 403)
        self.assertEqual(
            self.client.delete(
                f"/api/v1/organizations/{organization['id']}/tasks/{task['id']}",
                headers=self.bob,
            ).status_code,
            204,
        )

        audit = self.client.get(
            f"/api/v1/organizations/{organization['id']}/audit-events",
            headers=self.alice,
        ).json()
        actions = {item["action"] for item in audit}
        self.assertTrue({"task.created", "task.updated", "task.deleted"}.issubset(actions))

    def test_removed_identity_verification_routes_are_not_exposed(self):
        organization = self.create_organization()
        self.assertEqual(
            self.client.get(
                f"/api/v1/organizations/{organization['id']}/verification-cases",
                headers=self.alice,
            ).status_code,
            404,
        )
        self.assertEqual(self.client.get("/api/v1/secure-intake/removed-token").status_code, 404)

    def test_reports_aggregate_workspace_activity_and_export_for_read_only_members(self):
        self.alice["X-LensLayer-Name"] = "=SUM(1+1)"
        organization = self.create_organization()
        organization_id = organization["id"]
        uploaded = self.upload_contract(organization_id)
        self.assertEqual(uploaded.status_code, 202)
        contract_id = uploaded.json()["contract"]["id"]

        viewer_invite = self.invite(organization_id, "carol@example.com", "viewer").json()
        self.assertEqual(self.accept(viewer_invite["token"], self.carol).status_code, 200)
        reviewer_invite = self.invite(organization_id, "bob@example.com", "reviewer").json()
        self.assertEqual(self.accept(reviewer_invite["token"], self.bob).status_code, 200)

        overdue = self.client.post(
            f"/api/v1/organizations/{organization_id}/tasks",
            headers=self.alice,
            json={
                "title": "Resolve the renewal notice",
                "priority": "high",
                "due_at": (utcnow() - timedelta(days=2)).isoformat(),
            },
        )
        self.assertEqual(overdue.status_code, 201, overdue.text)
        completed = self.client.post(
            f"/api/v1/organizations/{organization_id}/tasks",
            headers=self.alice,
            json={"title": "Confirm governing law", "status": "done"},
        )
        self.assertEqual(completed.status_code, 201, completed.text)

        decision = self.client.post(
            f"/api/v1/organizations/{organization_id}/contracts/{contract_id}/decisions",
            headers=self.bob,
            json={
                "decision": "escalate",
                "subject": "Renewal notice",
                "rationale": "The notice window needs reviewer attention before signature.",
            },
        )
        self.assertEqual(decision.status_code, 201, decision.text)

        report = self.client.get(
            f"/api/v1/organizations/{organization_id}/reports/overview?range=all",
            headers=self.carol,
        )
        self.assertEqual(report.status_code, 200, report.text)
        payload = report.json()
        self.assertEqual(payload["organization_id"], organization_id)
        self.assertEqual(payload["contracts_total"], 1)
        self.assertEqual(payload["review_completed_count"], 0)
        self.assertEqual(payload["average_review_completion_hours"], 0)
        self.assertEqual(payload["upcoming_obligations"], 0)
        self.assertEqual(payload["material_findings_total"], 0)
        self.assertEqual(payload["evidence_backed_findings"], 0)
        self.assertEqual(payload["evidence_coverage"], 0)
        self.assertEqual(payload["tasks_total"], 2)
        self.assertEqual(payload["tasks_active"], 1)
        self.assertEqual(payload["tasks_overdue"], 1)
        self.assertEqual(payload["tasks_completed"], 1)
        self.assertEqual(payload["task_completion_rate"], 50)
        self.assertTrue(payload["timeline"])
        self.assertEqual(sum(item["decisions_recorded"] for item in payload["timeline"]), 1)
        self.assertTrue(payload["recent_activity"])
        self.assertEqual(len(payload["workload"]), 3)

        exported = self.client.get(
            f"/api/v1/organizations/{organization_id}/reports/export?range=all",
            headers=self.carol,
        )
        self.assertEqual(exported.status_code, 200, exported.text)
        self.assertIn("text/csv", exported.headers["content-type"])
        self.assertIn("attachment;", exported.headers["content-disposition"])
        self.assertIn("Human contract decisions", exported.text)
        self.assertIn("'=SUM(1+1)", exported.text)
        self.assertIn("Evidence,Coverage,0%", exported.text)
        self.assertIn("Reviewer,Email,Role", exported.text)

        inaccessible = self.client.get(
            f"/api/v1/organizations/{organization_id}/reports/overview",
            headers={
                "X-LensLayer-User": "outsider",
                "X-LensLayer-Email": "outsider@example.com",
            },
        )
        self.assertEqual(inaccessible.status_code, 403)

    def test_production_rejects_local_authentication(self):
        with self.assertRaisesRegex(ValueError, "Production requires OIDC"):
            Settings(_env_file=None, environment="production", auth_mode="local")

    def test_workspace_settings_notifications_q_and_a_and_review_exports(self):
        organization = self.create_organization()
        organization_id = organization["id"]
        current = self.client.get(
            f"/api/v1/organizations/{organization_id}/settings",
            headers=self.alice,
        )
        self.assertEqual(current.status_code, 200, current.text)
        self.assertEqual(current.json()["default_retention_days"], 30)
        updated = self.client.patch(
            f"/api/v1/organizations/{organization_id}/settings",
            headers=self.alice,
            json={
                "name": "Acme Contract Desk",
                "default_retention_days": 90,
                "default_retain_source_text": True,
            },
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["name"], "Acme Contract Desk")
        self.assertTrue(updated.json()["default_retain_source_text"])

        created = self.upload_contract(
            organization_id,
            retain_source_text="true",
            retain_document="true",
        ).json()
        report = {
            "title": "Supplier Agreement",
            "contract_type": "Services",
            "executive_summary": "A short supplier agreement with a 30 day payment obligation.",
            "overall_attention": "Medium",
            "risk_assessment": [
                {
                    "title": "Payment timing",
                    "risk_level": "Medium",
                    "explanation": "Payment is due within 30 days.",
                    "recommendation": "Confirm the invoice trigger.",
                    "citation": "L2",
                    "quote": "The customer must pay within 30 days.",
                }
            ],
            "missing_protections": [],
            "negotiation_priorities": [],
            "obligations": [],
            "deadlines": [],
            "payments": [],
        }
        self.run_worker_with_report(report)

        notifications = self.client.get(
            f"/api/v1/organizations/{organization_id}/notifications",
            headers=self.alice,
        )
        self.assertEqual(notifications.status_code, 200, notifications.text)
        self.assertEqual(notifications.json()[0]["kind"], "review_ready")
        notification_id = notifications.json()[0]["id"]
        marked = self.client.patch(
            f"/api/v1/organizations/{organization_id}/notifications/{notification_id}/read",
            headers=self.alice,
        )
        self.assertIsNotNone(marked.json()["read_at"])

        contract_id = created["contract"]["id"]
        with patch.dict("os.environ", {"GROQ_API_KEY": ""}):
            answer = self.client.post(
                f"/api/v1/organizations/{organization_id}/contracts/{contract_id}/questions",
                headers=self.alice,
                json={"question": "When must the customer pay?"},
            )
        self.assertEqual(answer.status_code, 200, answer.text)
        self.assertEqual(answer.json()["generated_by"], "extractive")
        self.assertTrue(answer.json()["sources"])
        self.assertIn("30 days", answer.json()["sources"][0]["excerpt"])

        expected_types = {
            "pdf": "application/pdf",
            "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "csv": "text/csv",
            "md": "text/markdown",
            "json": "application/json",
        }
        for export_format, media_type in expected_types.items():
            exported = self.client.get(
                f"/api/v1/organizations/{organization_id}/contracts/{contract_id}/exports/{export_format}",
                headers=self.alice,
            )
            self.assertEqual(exported.status_code, 200, exported.text)
            self.assertIn(media_type, exported.headers["content-type"])
            self.assertIn("attachment;", exported.headers["content-disposition"])

    def test_collaboration_approvals_secure_sharing_and_complete_activity(self):
        organization = self.create_organization()
        organization_id = organization["id"]
        reviewer_invite = self.invite(organization_id, "bob@example.com", "reviewer").json()
        self.assertEqual(self.accept(reviewer_invite["token"], self.bob).status_code, 200)
        members = self.client.get(
            f"/api/v1/organizations/{organization_id}/members",
            headers=self.alice,
        ).json()
        bob = next(item for item in members if item["email"] == "bob@example.com")
        created = self.upload_contract(
            organization_id,
            retain_source_text="true",
            retain_document="true",
        ).json()
        contract_id = created["contract"]["id"]
        report = {
            "title": "Supplier Agreement",
            "contract_type": "Services",
            "executive_summary": "The agreement renews annually unless either party gives 60 days notice.",
            "overall_attention": "High",
            "risk_assessment": [{
                "title": "Automatic renewal",
                "risk_level": "High",
                "explanation": "The renewal may occur without an operational reminder.",
                "recommendation": "Calendar the notice date.",
                "citation": "Renewal, page 2",
                "quote": "The agreement renews annually unless either party gives 60 days notice.",
            }],
            "missing_protections": [{"title": "Service credit", "description": "No service credit was detected."}],
            "negotiation_priorities": [{"title": "Renewal notice", "action": "Increase the notice window."}],
            "obligations": [],
            "deadlines": [],
            "payments": [],
        }
        self.run_worker_with_report(report)
        ready = self.client.get(
            f"/api/v1/organizations/{organization_id}/contracts/{contract_id}",
            headers=self.alice,
        )
        self.assertEqual(ready.json()["status"], "ready", ready.text)

        comment = self.client.post(
            f"/api/v1/organizations/{organization_id}/contracts/{contract_id}/comments",
            headers=self.alice,
            json={"body": "Bob, please verify the renewal language.", "mentioned_user_ids": [bob["user_id"]]},
        )
        self.assertEqual(comment.status_code, 201, comment.text)
        bob_notifications = self.client.get(
            f"/api/v1/organizations/{organization_id}/notifications",
            headers=self.bob,
        ).json()
        self.assertIn("mention", {item["kind"] for item in bob_notifications})

        decision = self.client.post(
            f"/api/v1/organizations/{organization_id}/contracts/{contract_id}/decisions",
            headers=self.bob,
            json={
                "decision": "escalate",
                "subject": "Automatic renewal",
                "rationale": "The notice window needs owner review before signature.",
            },
        )
        self.assertEqual(decision.status_code, 201, decision.text)
        approval = self.client.post(
            f"/api/v1/organizations/{organization_id}/contracts/{contract_id}/approvals",
            headers=self.alice,
            json={
                "title": "Approve renewal position",
                "note": "Confirm the revised notice position.",
                "assigned_to_user_id": bob["user_id"],
                "conditions": ["Notice window is at least 60 days"],
            },
        )
        self.assertEqual(approval.status_code, 201, approval.text)
        approval_id = approval.json()["id"]
        incomplete = self.client.post(
            f"/api/v1/organizations/{organization_id}/contracts/{contract_id}/approvals/{approval_id}/decision",
            headers=self.bob,
            json={"status": "approved", "resolution_note": "Approved after review.", "condition_results": {}},
        )
        self.assertEqual(incomplete.status_code, 422)
        resolved = self.client.post(
            f"/api/v1/organizations/{organization_id}/contracts/{contract_id}/approvals/{approval_id}/decision",
            headers=self.bob,
            json={
                "status": "conditionally_approved",
                "resolution_note": "Proceed when the counterparty accepts the notice window.",
                "condition_results": {"Notice window is at least 60 days": False},
            },
        )
        self.assertEqual(resolved.status_code, 200, resolved.text)

        shared = self.client.post(
            f"/api/v1/organizations/{organization_id}/contracts/{contract_id}/shares",
            headers=self.alice,
            json={"label": "External counsel", "include_evidence": True, "expires_in_days": 7},
        )
        self.assertEqual(shared.status_code, 201, shared.text)
        token = shared.json()["token"]
        public_review = self.client.get(f"/api/v1/shared/{token}")
        self.assertEqual(public_review.status_code, 200, public_review.text)
        self.assertEqual(public_review.json()["shared_for"], "External counsel")
        self.assertIn("renews annually", public_review.json()["risks"][0]["quote"])
        share_id = shared.json()["share"]["id"]
        self.assertEqual(
            self.client.delete(
                f"/api/v1/organizations/{organization_id}/contracts/{contract_id}/shares/{share_id}",
                headers=self.alice,
            ).status_code,
            204,
        )
        self.assertEqual(self.client.get(f"/api/v1/shared/{token}").status_code, 410)

        handoff = self.client.get(
            f"/api/v1/organizations/{organization_id}/contracts/{contract_id}/counsel-handoff",
            headers=self.alice,
        )
        self.assertEqual(handoff.status_code, 200, handoff.text)
        self.assertIn("openxmlformats", handoff.headers["content-type"])
        activity = self.client.get(
            f"/api/v1/organizations/{organization_id}/contracts/{contract_id}/activity",
            headers=self.alice,
        )
        self.assertEqual(activity.status_code, 200, activity.text)
        actions = {item["action"] for item in activity.json()}
        self.assertTrue(
            {"comment.created", "contract.decision_recorded", "approval.requested", "approval.decided", "share.created", "share.viewed", "share.revoked"}.issubset(actions)
        )
        self.assertTrue(all(item["actor_name"] for item in activity.json()))

    def test_revised_document_versions_and_negotiation_summary(self):
        organization = self.create_organization()
        organization_id = organization["id"]
        viewer_invite = self.invite(organization_id, "bob@example.com", "viewer").json()
        self.assertEqual(self.accept(viewer_invite["token"], self.bob).status_code, 200)
        created = self.upload_contract(
            organization_id,
            retain_source_text="true",
            retain_document="true",
        ).json()
        contract_id = created["contract"]["id"]
        report = {
            "title": "Supplier Agreement",
            "contract_type": "Services",
            "executive_summary": "A supplier agreement with a 30 day payment obligation.",
            "overall_attention": "Medium",
            "risk_assessment": [],
            "missing_protections": [],
            "negotiation_priorities": [{"title": "Payment period", "action": "Ask for 45 days."}],
            "obligations": [],
            "deadlines": [],
            "payments": [],
        }
        self.run_worker_with_report(report)

        original_versions = self.client.get(
            f"/api/v1/organizations/{organization_id}/contracts/{contract_id}/versions",
            headers=self.alice,
        )
        self.assertEqual(original_versions.status_code, 200, original_versions.text)
        self.assertEqual(original_versions.json()[0]["version_number"], 1)

        revision = self.client.post(
            f"/api/v1/organizations/{organization_id}/contracts/{contract_id}/versions",
            headers=self.alice,
            data={"label": "Counterparty redline", "notes": "Revised payment period."},
            files={
                "file": (
                    "supplier-v2.txt",
                    b"Agreement\nThe customer must pay within 45 days.\nSupplier accepts mutual confidentiality.",
                    "text/plain",
                )
            },
        )
        self.assertEqual(revision.status_code, 201, revision.text)
        comparison = revision.json()["comparison"]
        self.assertEqual(revision.json()["version_number"], 2)
        self.assertIn("45 days", " ".join(comparison["added"]))
        self.assertIn("30 days", " ".join(comparison["removed"]))

        item = self.client.post(
            f"/api/v1/organizations/{organization_id}/contracts/{contract_id}/negotiation-items",
            headers=self.alice,
            json={
                "title": "Extend payment period",
                "description": "Move customer payment from 30 to 45 days.",
                "category": "commercial",
                "priority": "high",
                "our_position": "45 days after invoice.",
                "counterparty_position": "Accepted in v2.",
            },
        )
        self.assertEqual(item.status_code, 201, item.text)
        item_id = item.json()["id"]
        accepted = self.client.patch(
            f"/api/v1/organizations/{organization_id}/contracts/{contract_id}/negotiation-items/{item_id}",
            headers=self.alice,
            json={"status": "accepted"},
        )
        self.assertEqual(accepted.status_code, 200, accepted.text)
        unresolved = self.client.post(
            f"/api/v1/organizations/{organization_id}/contracts/{contract_id}/negotiation-items",
            headers=self.alice,
            json={
                "title": "Clarify service credits",
                "category": "legal",
                "priority": "normal",
                "status": "unresolved",
            },
        )
        self.assertEqual(unresolved.status_code, 201, unresolved.text)
        rejected = self.client.post(
            f"/api/v1/organizations/{organization_id}/contracts/{contract_id}/negotiation-items",
            headers=self.alice,
            json={
                "title": "Unlimited liability",
                "category": "legal",
                "priority": "high",
                "status": "rejected",
            },
        )
        self.assertEqual(rejected.status_code, 201, rejected.text)

        response = self.client.post(
            f"/api/v1/organizations/{organization_id}/contracts/{contract_id}/counterparty-responses",
            headers=self.alice,
            json={
                "responder_name": "Example Supplier",
                "channel": "email",
                "body": "We accept the 45 day payment period but reject unlimited liability.",
                "contract_version_id": revision.json()["id"],
                "related_item_ids": [item_id, rejected.json()["id"]],
            },
        )
        self.assertEqual(response.status_code, 201, response.text)

        summary = self.client.get(
            f"/api/v1/organizations/{organization_id}/contracts/{contract_id}/negotiation-summary",
            headers=self.alice,
        )
        self.assertEqual(summary.status_code, 200, summary.text)
        payload = summary.json()
        self.assertEqual(payload["version_count"], 2)
        self.assertEqual(len(payload["accepted_changes"]), 1)
        self.assertEqual(len(payload["rejected_changes"]), 1)
        self.assertEqual(len(payload["unresolved_points"]), 1)
        self.assertIn("counterparty response", payload["final_summary"])

        viewer_upload = self.client.post(
            f"/api/v1/organizations/{organization_id}/contracts/{contract_id}/versions",
            headers=self.bob,
            data={"label": "Viewer edit"},
            files={"file": ("supplier-v3.txt", b"Attempted edit", "text/plain")},
        )
        self.assertEqual(viewer_upload.status_code, 403)
        activity = self.client.get(
            f"/api/v1/organizations/{organization_id}/contracts/{contract_id}/activity",
            headers=self.alice,
        ).json()
        self.assertTrue(
            {
                "contract.version_uploaded",
                "negotiation.item_created",
                "negotiation.item_updated",
                "negotiation.counterparty_response_recorded",
            }.issubset({event["action"] for event in activity})
        )

    def test_repeated_lifecycle_completion_creates_only_one_next_occurrence(self):
        organization_id = self.create_organization()["id"]
        contract_id = self.upload_contract(organization_id).json()["contract"]["id"]
        base = f"/api/v1/organizations/{organization_id}"
        created = self.client.post(
            f"{base}/contracts/{contract_id}/lifecycle",
            headers=self.alice,
            json={"kind": "payment", "title": "Monthly fee", "due_at": "2026-01-31T12:00:00Z", "recurrence": "monthly"},
        )
        self.assertEqual(created.status_code, 201, created.text)
        url = f"{base}/lifecycle/{created.json()['id']}"
        completed = self.client.patch(url, headers=self.alice, json={"status": "completed"})
        self.assertEqual(completed.status_code, 200, completed.text)
        retried = self.client.patch(url, headers=self.alice, json={"status": "completed"})
        self.assertEqual(retried.status_code, 200, retried.text)
        items = self.client.get(f"{base}/lifecycle", headers=self.alice).json()
        self.assertEqual(len(items), 2, "A retry must not create another recurring payment")
        self.assertEqual(retried.json()["completed_at"], completed.json()["completed_at"])
        next_item = next(item for item in items if item["status"] == "active")
        self.assertTrue(next_item["due_at"].startswith("2026-02-28T12:00:00"))

    def test_rescheduling_lifecycle_clears_old_escalation_and_reminder_state(self):
        organization_id = self.create_organization()["id"]
        contract_id = self.upload_contract(organization_id).json()["contract"]["id"]
        base = f"/api/v1/organizations/{organization_id}"
        created = self.client.post(
            f"{base}/contracts/{contract_id}/lifecycle",
            headers=self.alice,
            json={"kind": "renewal", "title": "Review renewal", "due_at": (utcnow() - timedelta(days=1)).isoformat()},
        )
        self.assertEqual(created.status_code, 201, created.text)
        from backend.app.worker import process_lifecycle_reminders
        process_lifecycle_reminders(self.client.app.state.database, self.settings)
        item = self.client.get(f"{base}/lifecycle", headers=self.alice).json()[0]
        self.assertIsNotNone(item["escalated_at"])
        self.assertIsNotNone(item["last_notified_at"])
        url = f"{base}/lifecycle/{item['id']}"
        unchanged = self.client.patch(url, headers=self.alice, json={"due_at": item["due_at"]})
        self.assertEqual(unchanged.status_code, 200, unchanged.text)
        self.assertEqual(unchanged.json()["escalated_at"], item["escalated_at"])
        self.assertEqual(unchanged.json()["last_notified_at"], item["last_notified_at"])
        updated = self.client.patch(url, headers=self.alice, json={"due_at": (utcnow() + timedelta(days=30)).isoformat()})
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertIsNone(updated.json()["escalated_at"])
        self.assertIsNone(updated.json()["last_notified_at"])
        self.assertEqual(process_lifecycle_reminders(self.client.app.state.database, self.settings), 0)
        self.client.patch(url, headers=self.alice, json={"due_at": (utcnow() - timedelta(hours=1)).isoformat()})
        self.assertGreater(process_lifecycle_reminders(self.client.app.state.database, self.settings), 0)
        item = self.client.get(f"{base}/lifecycle", headers=self.alice).json()[0]
        self.assertIsNotNone(item["escalated_at"])

    def test_lifecycle_recurring_reminders_calendar_and_portfolio_questions(self):
        organization = self.create_organization()
        organization_id = organization["id"]
        reviewer_invite = self.invite(organization_id, "bob@example.com", "reviewer").json()
        self.assertEqual(self.accept(reviewer_invite["token"], self.bob).status_code, 200)
        members = self.client.get(
            f"/api/v1/organizations/{organization_id}/members",
            headers=self.alice,
        ).json()
        bob = next(item for item in members if item["email"] == "bob@example.com")
        created = self.upload_contract(
            organization_id,
            retain_source_text="true",
            retain_document="true",
        ).json()
        contract_id = created["contract"]["id"]
        report = {
            "title": "Supplier Agreement",
            "contract_type": "Services",
            "executive_summary": "A supplier agreement with annual renewal and monthly fees.",
            "overall_attention": "Medium",
            "risk_assessment": [],
            "missing_protections": [],
            "negotiation_priorities": [],
            "obligations": [],
            "deadlines": [],
            "payments": [],
        }
        self.run_worker_with_report(report)

        lifecycle = self.client.post(
            f"/api/v1/organizations/{organization_id}/contracts/{contract_id}/lifecycle",
            headers=self.alice,
            json={
                "kind": "payment",
                "title": "Pay monthly supplier fee",
                "amount": "USD 2,500",
                "due_at": (utcnow() - timedelta(hours=2)).isoformat(),
                "owner_user_id": bob["user_id"],
                "reminder_days": 0,
                "recurrence": "monthly",
            },
        )
        self.assertEqual(lifecycle.status_code, 201, lifecycle.text)
        item = lifecycle.json()
        self.assertEqual(item["owner_name"], "Bob")
        run_worker(self.settings, once=True)
        notifications = self.client.get(
            f"/api/v1/organizations/{organization_id}/notifications",
            headers=self.bob,
        ).json()
        self.assertIn("lifecycle_overdue", {entry["kind"] for entry in notifications})

        completed = self.client.patch(
            f"/api/v1/organizations/{organization_id}/lifecycle/{item['id']}",
            headers=self.bob,
            json={"status": "completed"},
        )
        self.assertEqual(completed.status_code, 200, completed.text)
        listed = self.client.get(
            f"/api/v1/organizations/{organization_id}/lifecycle?contract_id={contract_id}",
            headers=self.alice,
        ).json()
        self.assertEqual(len(listed), 2)
        self.assertEqual({entry["status"] for entry in listed}, {"active", "completed"})

        calendar = self.client.get(
            f"/api/v1/organizations/{organization_id}/calendar.ics",
            headers=self.alice,
        )
        self.assertEqual(calendar.status_code, 200, calendar.text)
        self.assertIn("text/calendar", calendar.headers["content-type"])
        self.assertIn("Pay monthly supplier fee", calendar.text)
        with patch.dict("os.environ", {"GROQ_API_KEY": ""}):
            answer = self.client.post(
                f"/api/v1/organizations/{organization_id}/portfolio/questions",
                headers=self.alice,
                json={"question": "Which agreements require payment within 30 days?"},
            )
        self.assertEqual(answer.status_code, 200, answer.text)
        self.assertEqual(answer.json()["generated_by"], "extractive")
        self.assertTrue(answer.json()["sources"])
        self.assertEqual(answer.json()["sources"][0]["contract_id"], contract_id)
        audit_before = self.client.get(
            f"/api/v1/organizations/{organization_id}/audit-events",
            headers=self.alice,
        ).json()
        unmatched = self.client.post(
            f"/api/v1/organizations/{organization_id}/portfolio/questions",
            headers=self.alice,
            json={"question": "Which agreements mention xenon thrusters?"},
        )
        audit_after = self.client.get(
            f"/api/v1/organizations/{organization_id}/audit-events",
            headers=self.alice,
        ).json()
        self.assertEqual(unmatched.status_code, 200, unmatched.text)
        self.assertEqual(unmatched.json()["sources"], [])
        self.assertEqual(len(audit_after), len(audit_before))

    def test_intake_integrations_public_api_and_webhook_delivery_logs(self):
        organization = self.create_organization()
        organization_id = organization["id"]
        webhook = self.client.post(
            f"/api/v1/organizations/{organization_id}/webhooks",
            headers=self.alice,
            json={
                "target_url": "https://hooks.example.test/lenslayer",
                "description": "Operations automation",
                "events": ["contract.created", "contract.review_ready"],
            },
        )
        self.assertEqual(webhook.status_code, 201, webhook.text)
        self.assertTrue(webhook.json()["signing_secret"].startswith("whsec_"))

        api_key_response = self.client.post(
            f"/api/v1/organizations/{organization_id}/api-keys",
            headers=self.alice,
            json={"name": "Intake API", "scopes": ["contracts:write", "contracts:read"]},
        )
        self.assertEqual(api_key_response.status_code, 201, api_key_response.text)
        token = api_key_response.json()["token"]
        self.assertTrue(token.startswith("ll_live_"))

        public_upload = self.client.post(
            "/api/v1/public/contracts",
            headers={"Authorization": f"Bearer {token}"},
            data={
                "title": "API Supplier Agreement",
                "external_id": "api-001",
                "retain_source_text": "true",
                "retain_document": "true",
            },
            files={"file": ("api-supplier.txt", b"Agreement\nPayment is due within 30 days.", "text/plain")},
        )
        self.assertEqual(public_upload.status_code, 202, public_upload.text)
        public_payload = public_upload.json()
        contract_id = public_payload["contract"]["id"]
        self.assertEqual(public_payload["import_record"]["provider"], "public_api")
        self.assertEqual(public_payload["import_record"]["external_id"], "api-001")

        duplicate = self.client.post(
            "/api/v1/public/contracts",
            headers={"Authorization": f"Bearer {token}"},
            data={"title": "Duplicate", "external_id": "api-001"},
            files={"file": ("api-supplier.txt", b"Agreement", "text/plain")},
        )
        self.assertEqual(duplicate.status_code, 409)

        public_get = self.client.get(
            f"/api/v1/public/contracts/{contract_id}",
            headers={"X-LensLayer-Api-Key": token},
        )
        self.assertEqual(public_get.status_code, 200, public_get.text)
        self.assertEqual(public_get.json()["id"], contract_id)

        report = {
            "title": "API Supplier Agreement",
            "contract_type": "Services",
            "executive_summary": "Imported through the public API.",
            "overall_attention": "Low",
            "risk_assessment": [],
            "missing_protections": [],
            "negotiation_priorities": [],
            "obligations": [],
            "deadlines": [],
            "payments": [],
        }
        self.run_worker_with_report(report)

        deliveries = self.client.get(
            f"/api/v1/organizations/{organization_id}/webhook-deliveries",
            headers=self.alice,
        )
        self.assertEqual(deliveries.status_code, 200, deliveries.text)
        self.assertTrue(
            {"contract.created", "contract.review_ready"}.issubset(
                {item["event_type"] for item in deliveries.json()}
            )
        )
        imports = self.client.get(
            f"/api/v1/organizations/{organization_id}/integrations/imports?provider=public_api",
            headers=self.alice,
        ).json()
        self.assertEqual(imports[0]["status"], "ready")

        email_import = self.client.post(
            f"/api/v1/organizations/{organization_id}/intake/email",
            headers=self.alice,
            data={"sender": "counsel@example.test", "subject": "Forwarded NDA", "external_id": "email-001"},
            files={"file": ("nda.txt", b"NDA\nMutual confidentiality applies.", "text/plain")},
        )
        self.assertEqual(email_import.status_code, 202, email_import.text)
        self.assertEqual(email_import.json()["import_record"]["source_type"], "forwarded_email")

        drive_connection = self.client.post(
            f"/api/v1/organizations/{organization_id}/integrations",
            headers=self.alice,
            json={
                "provider": "google_drive",
                "display_name": "Legal Drive",
                "external_account_id": "drive-acme",
                "capabilities": ["file_import"],
            },
        )
        self.assertEqual(drive_connection.status_code, 201, drive_connection.text)
        drive_import = self.client.post(
            f"/api/v1/organizations/{organization_id}/integrations/google-drive/imports",
            headers=self.alice,
            data={
                "connection_id": drive_connection.json()["id"],
                "drive_file_id": "drive-file-001",
                "source_url": "https://drive.google.com/file/d/drive-file-001",
                "title": "Drive MSA",
            },
            files={"file": ("msa.txt", b"MSA\nEither party may terminate on 30 days notice.", "text/plain")},
        )
        self.assertEqual(drive_import.status_code, 202, drive_import.text)
        self.assertEqual(drive_import.json()["import_record"]["provider"], "google_drive")

        slack_connection = self.client.post(
            f"/api/v1/organizations/{organization_id}/integrations",
            headers=self.alice,
            json={
                "provider": "slack",
                "display_name": "Legal review channel",
                "external_account_id": "C123LEGAL",
                "capabilities": ["review_notifications"],
                "settings": {"channel": "#legal-review"},
            },
        )
        self.assertEqual(slack_connection.status_code, 201, slack_connection.text)
        self.assertIn("review_notifications", slack_connection.json()["capabilities"])

        listed_connections = self.client.get(
            f"/api/v1/organizations/{organization_id}/integrations",
            headers=self.alice,
        )
        self.assertEqual(listed_connections.status_code, 200, listed_connections.text)
        self.assertEqual(
            {"google_drive", "slack"},
            {item["provider"] for item in listed_connections.json()},
        )

        api_key_id = api_key_response.json()["api_key"]["id"]
        revoked = self.client.delete(
            f"/api/v1/organizations/{organization_id}/api-keys/{api_key_id}",
            headers=self.alice,
        )
        self.assertEqual(revoked.status_code, 204)
        forbidden = self.client.get(
            f"/api/v1/public/contracts/{contract_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(forbidden.status_code, 401)

    def test_remaining_integration_provider_catalog_and_generic_import(self):
        organization = self.create_organization()
        organization_id = organization["id"]
        providers = self.client.get(
            f"/api/v1/organizations/{organization_id}/integrations/providers",
            headers=self.alice,
        )
        self.assertEqual(providers.status_code, 200, providers.text)
        self.assertEqual(
            {
                "email",
                "google_drive",
                "onedrive",
                "sharepoint",
                "dropbox",
                "slack",
                "telegram",
                "whatsapp",
                "public_api",
            },
            {item["provider"] for item in providers.json()},
        )
        address = self.client.get(
            f"/api/v1/organizations/{organization_id}/intake/email-address",
            headers=self.alice,
        )
        self.assertEqual(address.status_code, 200, address.text)
        self.assertIn("contracts+acme-operations@", address.json()["address"])

        connection = self.client.post(
            f"/api/v1/organizations/{organization_id}/integrations",
            headers=self.alice,
            json={
                "provider": "onedrive",
                "display_name": "Legal OneDrive",
                "external_account_id": "drive-001",
            },
        )
        self.assertEqual(connection.status_code, 201, connection.text)
        self.assertIn("document_import", connection.json()["capabilities"])
        imported = self.client.post(
            f"/api/v1/organizations/{organization_id}/integrations/onedrive/imports",
            headers=self.alice,
            data={
                "connection_id": connection.json()["id"],
                "external_id": "one-file-001",
                "title": "OneDrive NDA",
            },
            files={"file": ("onedrive-nda.txt", b"Mutual NDA", "text/plain")},
        )
        self.assertEqual(imported.status_code, 202, imported.text)
        self.assertEqual(imported.json()["import_record"]["provider"], "onedrive")

        unsafe_settings = self.client.post(
            f"/api/v1/organizations/{organization_id}/integrations",
            headers=self.alice,
            json={
                "provider": "telegram",
                "display_name": "Legal bot",
                "settings": {"bot_token": "do-not-store-this"},
            },
        )
        self.assertEqual(unsafe_settings.status_code, 422, unsafe_settings.text)

    def test_production_rejects_automatic_schema_creation(self):
        with self.assertRaisesRegex(ValueError, "Alembic migrations"):
            Settings(
                _env_file=None,
                environment="production",
                auth_mode="oidc",
                oidc_issuer="https://identity.example/",
                oidc_audience="lenslayer-api",
                oidc_jwks_url="https://identity.example/.well-known/jwks.json",
                auto_create_schema=True,
            )

    def test_production_requires_postgresql_and_private_object_storage(self):
        common = {
            "_env_file": None,
            "environment": "production",
            "auth_mode": "oidc",
            "oidc_issuer": "https://identity.example/",
            "oidc_audience": "lenslayer-api",
            "oidc_jwks_url": "https://identity.example/.well-known/jwks.json",
            "auto_create_schema": False,
        }
        with self.assertRaisesRegex(ValueError, "PostgreSQL"):
            Settings(**common)
        with self.assertRaisesRegex(ValueError, "S3-compatible"):
            Settings(**common, database_url="postgresql+psycopg://lenslayer@example/lenslayer")


if __name__ == "__main__":
    unittest.main()
