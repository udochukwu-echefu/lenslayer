"""Prevent list serializers from issuing one database query per returned row.

Run `python -m tests.test_query_performance --benchmark` for local measurements.
Timings include FastAPI serialization and local SQLite; they are not production SLAs.
"""
from __future__ import annotations

import json
import statistics
import sys
import tempfile
import time
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import event

from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.models import Contract, DocumentAsset, LifecycleItem, Membership, ProcessingJob, User, WorkflowTask, utcnow


class ListQueryPerformanceTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        root = Path(self.tempdir.name)
        settings = Settings(_env_file=None, environment="test", auth_mode="local", database_url=f"sqlite:///{root / 'test.db'}", object_storage_root=root / "objects")
        self.client = self.enterContext(TestClient(create_app(settings)))
        self.headers = {"X-LensLayer-User": "owner", "X-LensLayer-Email": "owner@example.com", "X-LensLayer-Name": "Owner"}
        response = self.client.post("/api/v1/organizations", headers=self.headers, json={"name": "Query benchmark", "slug": "query-benchmark"})
        self.assertEqual(response.status_code, 201, response.text)
        self.organization_id = response.json()["id"]
        self.database = self.client.app.state.database
        self.seed_rows(20)

    def seed_rows(self, count):
        with self.database.session_factory() as session:
            for index in range(count):
                user = User(external_subject=f"member-{index}", email=f"member-{index}@example.com", display_name=f"Member {index}")
                session.add(user)
                session.flush()
                session.add(Membership(organization_id=self.organization_id, user_id=user.id, role="reviewer"))
                contract = Contract(organization_id=self.organization_id, created_by_user_id=user.id, title=f"Contract {index}", source_name=f"contract-{index}.txt")
                session.add(contract)
                session.flush()
                asset = DocumentAsset(organization_id=self.organization_id, contract_id=contract.id, storage_key=f"fixture/{index}.txt", original_name=contract.source_name, content_type="text/plain", size_bytes=4, sha256="0" * 64)
                session.add(asset)
                session.flush()
                session.add(ProcessingJob(organization_id=self.organization_id, contract_id=contract.id, document_asset_id=asset.id))
                session.add(WorkflowTask(organization_id=self.organization_id, contract_id=contract.id, created_by_user_id=user.id, assigned_to_user_id=user.id, title=f"Task {index}", due_at=utcnow()))
                session.add(LifecycleItem(organization_id=self.organization_id, contract_id=contract.id, created_by_user_id=user.id, owner_user_id=user.id, kind="renewal", title=f"Renewal {index}", due_at=utcnow()))
            session.commit()

    def measure(self, path):
        statements = []
        def count_query(_connection, _cursor, statement, _parameters, _context, _executemany):
            if statement.lstrip().upper().startswith("SELECT"):
                statements.append(statement)
        event.listen(self.database.engine, "before_cursor_execute", count_query)
        started = time.perf_counter()
        try:
            response = self.client.get(f"/api/v1/organizations/{self.organization_id}/{path}", headers=self.headers)
        finally:
            elapsed = (time.perf_counter() - started) * 1000
            event.remove(self.database.engine, "before_cursor_execute", count_query)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json(), len(statements), elapsed

    def test_contract_list_batches_jobs(self):
        rows, count, _ = self.measure("contracts")
        self.assertEqual(len(rows), 20)
        self.assertTrue(all(row["latest_job"] is not None for row in rows))
        self.assertLessEqual(count, 5)

    def test_task_list_batches_contracts_and_assignees(self):
        rows, count, _ = self.measure("tasks")
        self.assertEqual(len(rows), 20)
        self.assertTrue(all(row["contract_title"] and row["assigned_to_name"] for row in rows))
        self.assertLessEqual(count, 6)

    def test_lifecycle_list_batches_contracts_and_owners(self):
        rows, count, _ = self.measure("lifecycle")
        self.assertEqual(len(rows), 20)
        self.assertTrue(all(row["contract_title"] and row["owner_name"] for row in rows))
        self.assertLessEqual(count, 6)

    def test_member_list_loads_users_in_the_existing_join(self):
        rows, count, _ = self.measure("members")
        self.assertEqual(len(rows), 21)
        self.assertTrue(all(row["display_name"] for row in rows))
        self.assertLessEqual(count, 4)


    def test_reports_batch_review_and_member_data(self):
        report, count, _ = self.measure("reports/overview?range=30d")
        self.assertEqual(report["contracts_total"], 20)
        self.assertEqual(len(report["workload"]), 21)
        self.assertLessEqual(count, 12)


if __name__ == "__main__" and "--benchmark" in sys.argv:
    case = ListQueryPerformanceTests()
    try:
        case.setUp()
        report = {}
        for path in ("contracts", "tasks", "lifecycle", "members"):
            case.measure(path)  # Warm route and SQL compilation caches.
            samples = [case.measure(path) for _ in range(7)]
            report[path] = {"rows": len(samples[0][0]), "select_queries": samples[0][1], "median_ms": round(statistics.median(item[2] for item in samples), 2)}
        print(json.dumps(report, indent=2))
    finally:
        case.doCleanups()
elif __name__ == "__main__":
    unittest.main()
