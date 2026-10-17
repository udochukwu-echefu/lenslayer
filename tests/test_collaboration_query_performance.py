"""Local SQLite regressions for collaboration list loading and response contracts."""
from __future__ import annotations

import json
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import event, select

from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.models import (
    ApprovalRequest, Contract, ContractComment, ContractDecision, Membership, User, new_id,
)


class CollaborationQueryPerformanceTests(unittest.TestCase):
    def setUp(self):
        tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(tempdir.cleanup)
        root = Path(tempdir.name)
        settings = Settings(
            _env_file=None,
            environment="test",
            auth_mode="local",
            database_url=f"sqlite:///{root / 'collaboration.db'}",
            object_storage_backend="local",
            object_storage_root=root / "objects",
            email_backend="disabled",
            hosted_model_enabled=False,
        )
        self.client = self.enterContext(TestClient(create_app(settings)))
        self.database = self.client.app.state.database
        self.headers = {
            "X-LensLayer-User": "owner",
            "X-LensLayer-Email": "owner@example.com",
            "X-LensLayer-Name": "Owner",
        }
        self.organization_id = self.create_organization("collaboration")
        self.other_organization_id = self.create_organization("other")
        with self.database.session_factory() as session:
            self.owner_id = session.scalar(select(User.id).where(User.external_subject == "owner"))

    def create_organization(self, slug):
        response = self.client.post(
            "/api/v1/organizations", headers=self.headers, json={"name": slug, "slug": slug},
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def create_contract(self, organization_id=None):
        with self.database.session_factory() as session:
            contract = Contract(
                id=new_id(), organization_id=organization_id or self.organization_id,
                created_by_user_id=self.owner_id, title="Synthetic contract", source_name="fixture.txt",
            )
            session.add(contract)
            session.commit()
            return contract.id

    def seed_rows(self, kind, contract_id, count, organization_id=None, nullable=False):
        organization_id = organization_id or self.organization_id
        expected = []
        with self.database.session_factory() as session:
            def participant(role):
                # Every role on every row gets a different user, never the requesting owner.
                user_id = new_id()
                user = User(
                    id=user_id, external_subject=user_id,
                    email=f"{user_id}@example.com", display_name=f"{role} {user_id}",
                )
                session.add(user)
                session.flush()
                session.add(Membership(organization_id=organization_id, user_id=user_id, role="reviewer"))
                return user

            for index in range(count):
                # Alternate oldest/newest: neither list ordering matches insertion order.
                minute = index // 2 if index % 2 == 0 else count - 1 - index // 2
                created = datetime(2026, 1, 1) + timedelta(minutes=minute)
                updated = created + timedelta(seconds=1)
                row_id = new_id()
                common = dict(id=row_id, organization_id=organization_id, contract_id=contract_id, created_at=created)
                if kind == "comments":
                    author = participant("Author")
                    mentions = [self.owner_id, author.id]
                    body = f"Comment {index}"
                    session.add(ContractComment(
                        **common, author_user_id=author.id, body=body,
                        mentions_json=json.dumps(mentions), updated_at=updated,
                    ))
                    expected.append(dict(
                        id=row_id, body=body, mentioned_user_ids=mentions,
                        author_user_id=author.id, author_name=author.display_name, author_email=author.email,
                        created_at=created.isoformat(), updated_at=updated.isoformat(),
                    ))
                elif kind == "decisions":
                    reviewer = participant("Reviewer")
                    reference = {"page": index + 1, "quote": "Synthetic clause"}
                    subject, rationale = f"Subject {index}", f"Rationale {index}"
                    session.add(ContractDecision(
                        **common, reviewer_user_id=reviewer.id, decision="escalate", subject=subject,
                        rationale=rationale, source_reference_json=json.dumps(reference),
                    ))
                    expected.append(dict(
                        id=row_id, decision="escalate", subject=subject, rationale=rationale,
                        source_reference=reference, reviewer_user_id=reviewer.id,
                        reviewer_name=reviewer.display_name, reviewer_email=reviewer.email,
                        created_at=created.isoformat(),
                    ))
                else:
                    requester = participant("Requester")
                    # Nullable test covers all four assignee/resolver combinations.
                    assignee = participant("Assignee") if not nullable or index % 2 else None
                    resolver = participant("Resolver") if not nullable or index % 4 >= 2 else None
                    conditions = ["Legal review"]
                    results = {"Legal review": True} if resolver else {}
                    title, note = f"Approval {index}", f"Note {index}"
                    status = "approved" if resolver else "pending"
                    resolution_note = "Reviewed" if resolver else ""
                    due = created + timedelta(days=1) if assignee else None
                    resolved = updated if resolver else None
                    session.add(ApprovalRequest(
                        **common, requested_by_user_id=requester.id,
                        assigned_to_user_id=assignee.id if assignee else None,
                        resolved_by_user_id=resolver.id if resolver else None,
                        title=title, note=note, status=status, conditions_json=json.dumps(conditions),
                        condition_results_json=json.dumps(results), resolution_note=resolution_note,
                        due_at=due, resolved_at=resolved, updated_at=updated,
                    ))
                    expected.append(dict(
                        id=row_id, contract_id=contract_id, title=title, note=note, status=status,
                        conditions=conditions, condition_results=results,
                        requested_by_user_id=requester.id, requested_by_name=requester.display_name,
                        assigned_to_user_id=assignee.id if assignee else None,
                        assigned_to_name=assignee.display_name if assignee else None,
                        resolved_by_user_id=resolver.id if resolver else None,
                        resolved_by_name=resolver.display_name if resolver else None,
                        resolution_note=resolution_note, due_at=due.isoformat() if due else None,
                        resolved_at=resolved.isoformat() if resolved else None,
                        created_at=created.isoformat(), updated_at=updated.isoformat(),
                    ))
            session.commit()
        return sorted(expected, key=lambda row: row["created_at"], reverse=kind == "approvals")

    def measure(self, kind, contract_id, organization_id=None, headers=None):
        statements = []

        def count_query(_connection, _cursor, statement, _parameters, _context, _executemany):
            if statement.lstrip().upper().startswith("SELECT"):
                statements.append(statement)

        event.listen(self.database.engine, "before_cursor_execute", count_query)
        try:
            response = self.client.get(
                f"/api/v1/organizations/{organization_id or self.organization_id}/contracts/{contract_id}/{kind}",
                headers=self.headers if headers is None else headers,
            )
        finally:
            event.remove(self.database.engine, "before_cursor_execute", count_query)
        return response, statements

    def assert_bounded_queries(self, statements):
        # Includes authentication, membership authorization, contract lookup and list + serialization.
        self.assertEqual(len(statements), 4, f"Expected four SELECTs, got {len(statements)}")
        standalone_user_queries = [sql for sql in statements if "\nFROM platform_users " in sql]
        self.assertEqual(len(standalone_user_queries), 1, "Only authentication should query users separately")

    def check_distinct_participants(self, kind):
        for count in (1, 20, 100):
            with self.subTest(kind=kind, records=count):
                contract_id = self.create_contract()
                expected = self.seed_rows(kind, contract_id, count)
                response, statements = self.measure(kind, contract_id)
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json(), expected)
                self.assert_bounded_queries(statements)

    def test_comments_have_constant_queries_with_distinct_authors(self):
        self.check_distinct_participants("comments")

    def test_decisions_have_constant_queries_with_distinct_reviewers(self):
        self.check_distinct_participants("decisions")

    def test_approvals_have_constant_queries_with_three_distinct_users_per_row(self):
        self.check_distinct_participants("approvals")

    def test_approvals_preserve_nullable_assignees_and_resolvers(self):
        contract_id = self.create_contract()
        expected = self.seed_rows("approvals", contract_id, 4, nullable=True)
        response, statements = self.measure("approvals", contract_id)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), expected)
        self.assert_bounded_queries(statements)

    def test_lists_preserve_authorization_and_both_scope_filters(self):
        contract_id = self.create_contract()
        sibling_id = self.create_contract()
        foreign_id = self.create_contract(self.other_organization_id)
        outsider = {"X-LensLayer-User": "outsider", "X-LensLayer-Email": "outsider@example.com"}
        for kind in ("comments", "decisions", "approvals"):
            with self.subTest(kind=kind):
                expected = self.seed_rows(kind, contract_id, 1)
                self.seed_rows(kind, sibling_id, 1)
                foreign = self.seed_rows(kind, foreign_id, 1, self.other_organization_id)
                # Also test organization filtering independently of contract filtering.
                self.seed_rows(kind, contract_id, 1, self.other_organization_id)
                response, statements = self.measure(kind, contract_id)
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json(), expected)
                self.assert_bounded_queries(statements)
                response, _ = self.measure(kind, foreign_id, self.other_organization_id)
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json(), foreign)
                response, _ = self.measure(kind, contract_id, headers=outsider)
                self.assertEqual(response.status_code, 403, response.text)
                response, _ = self.measure(kind, foreign_id)
                self.assertEqual(response.status_code, 404, response.text)
                response, _ = self.measure(kind, contract_id, self.other_organization_id)
                self.assertEqual(response.status_code, 404, response.text)
                response, _ = self.measure(kind, "missing")
                self.assertEqual(response.status_code, 404, response.text)

    def test_empty_lists_keep_the_same_response_shape_and_query_budget(self):
        contract_id = self.create_contract()
        for kind in ("comments", "decisions", "approvals"):
            with self.subTest(kind=kind):
                response, statements = self.measure(kind, contract_id)
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json(), [])
                self.assert_bounded_queries(statements)


if __name__ == "__main__":
    unittest.main()
