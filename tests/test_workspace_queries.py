"""Additive query contract: bounded materialization, accurate counts, isolation.

Benchmark: python -m tests.test_workspace_queries --benchmark [--output FILE]
Uses the same synthetic fixture for old arrays and new queries. No providers.
"""
from __future__ import annotations

import argparse
import gzip
import json
import statistics
import subprocess
import tempfile
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import event, select

from backend.app.application import create_app
from backend.app.config import Settings
from backend.app.models import (
    Contract, DocumentAsset, LifecycleItem, Membership, ProcessingJob, User, WorkflowTask,
)


class WorkspaceQueryTests(unittest.TestCase):
    def setUp(self):
        directory = self.enterContext(tempfile.TemporaryDirectory(prefix="lenslayer-query-test-"))
        root = Path(directory)
        settings = Settings(_env_file=None, environment="test", auth_mode="local", auto_create_schema=True,
                            database_url=f"sqlite:///{root / 'test.db'}", object_storage_backend="local", object_storage_root=root / "objects",
                            malware_scan_backend="signature", email_backend="disabled", review_worker_job="", agent_worker_mode="continuous", hosted_model_enabled=False)
        self.client = self.enterContext(TestClient(create_app(settings, review_workflow_factory=lambda: object())))
        self.headers = {"X-LensLayer-User": "query-owner", "X-LensLayer-Email": "owner@example.invalid", "X-LensLayer-Name": "Synthetic owner"}
        self.other_headers = {"X-LensLayer-User": "other-owner", "X-LensLayer-Email": "other@example.invalid", "X-LensLayer-Name": "Synthetic other"}
        self.organization_id = self.client.post("/api/v1/organizations", headers=self.headers, json={"name": "Query fixture", "slug": "query-fixture"}).json()["id"]
        self.other_id = self.client.post("/api/v1/organizations", headers=self.other_headers, json={"name": "Private other", "slug": "private-other"}).json()["id"]
        self.user_id = self.client.get("/api/v1/me", headers=self.headers).json()["id"]
        self.db = self.client.app.state.database
        self.day = datetime(2026, 10, 18, tzinfo=timezone.utc)
        self.seed(121)

    def seed(self, count, start=0):
        with self.db.session_factory() as session:
            for index in range(start, start + count):
                contract = Contract(id=f"contract-{index:06}", organization_id=self.organization_id, created_by_user_id=self.user_id,
                                    title=f"Agreement {index:06}", source_name=f"synthetic-{index}.txt", counterparty="Literal_100% Supplier" if index == 0 else "Synthetic supplier",
                                    status="ready" if index % 2 == 0 else "failed", created_at=self.day, updated_at=self.day)
                session.add(contract)
                session.add(WorkflowTask(id=f"task-{index:06}", organization_id=self.organization_id, created_by_user_id=self.user_id, contract_id=contract.id,
                                         assigned_to_user_id=self.user_id, title=f"Action {index:06}", status="done" if index % 3 == 0 else "open", due_at=self.day + timedelta(days=index % 10 - 3)))
                session.add(LifecycleItem(id=f"lifecycle-{index:06}", organization_id=self.organization_id, created_by_user_id=self.user_id,
                                          contract_id=contract.id, owner_user_id=None if index % 2 else self.user_id, title=f"Renewal {index:06}", kind="renewal", status="active", due_at=self.day + timedelta(days=index % 10)))
            session.commit()

    def get(self, route, params=None, headers=None, organization_id=None):
        return self.client.get(f"/api/v1/organizations/{organization_id or self.organization_id}/{route}", params=params, headers=headers or self.headers)

    def measured(self, route, params=None):
        statements = []
        def observe(_conn, _cursor, statement, _parameters, _context, _executemany):
            if statement.lstrip().upper().startswith("SELECT"):
                statements.append(statement)
        event.listen(self.db.engine, "before_cursor_execute", observe)
        start = time.perf_counter()
        try:
            result = self.get(route, params)
        finally:
            duration = (time.perf_counter() - start) * 1000
            event.remove(self.db.engine, "before_cursor_execute", observe)
        self.assertEqual(result.status_code, 200, result.text)
        return result, len(statements), duration

    def test_legacy_arrays_are_still_complete(self):
        for collection in ["contracts", "tasks", "lifecycle"]:
            response = self.get(collection)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertIsInstance(response.json(), list)
            self.assertEqual(len(response.json()), 121)

    def test_all_pages_are_stably_ordered_and_counts_are_not_page_lengths(self):
        for collection in ["contracts", "tasks", "lifecycle"]:
            with self.subTest(collection=collection):
                seen = []
                for offset in [0, 25, 50, 75, 100]:
                    response = self.get(f"query/{collection}", {"limit": 25, "offset": offset, "sort": "title", "descending": False})
                    self.assertEqual(response.status_code, 200, response.text)
                    page = response.json()
                    self.assertEqual(page["total"], 121)
                    self.assertEqual(page["offset"], offset)
                    self.assertLessEqual(len(page["items"]), 25)
                    seen.extend(row["id"] for row in page["items"])
                self.assertEqual(len(set(seen)), 121)
                self.assertEqual(seen, sorted(seen))
                tied = self.get(f"query/{collection}", {"limit": 100, "sort": "created_at", "descending": True}).json()["items"]
                self.assertEqual([row["id"] for row in tied], sorted([row["id"] for row in tied], reverse=True))

    def test_filtering_sorting_and_literal_search_precede_paging(self):
        page = self.get("query/contracts", {"q": "Agreement", "status": "ready", "sort": "title", "descending": False, "offset": 25, "limit": 5}).json()
        self.assertEqual(page["total"], 61)
        self.assertEqual([row["id"] for row in page["items"]], [f"contract-{index:06}" for index in range(50, 60, 2)])
        literal = self.get("query/contracts", {"q": "100%"}).json()
        self.assertEqual(literal["total"], 1)
        self.assertEqual(self.get("query/contracts", {"q": "Literal_100%"}).json()["total"], 1)
        filtered = self.get("query/tasks", {"status": "open", "assigned_to_user_id": self.user_id, "contract_id": "contract-000001"}).json()
        self.assertEqual(filtered["total"], 1)
        self.assertEqual(filtered["items"][0]["assigned_to_name"], "Synthetic owner")
        dates = self.get("query/lifecycle", {"status": "active", "due_after": self.day.isoformat(), "due_before": self.day.isoformat(), "limit": 100}).json()
        self.assertEqual(dates["total"], 13)
        self.assertTrue(all(row["due_at"].startswith("2026-10-18") for row in dates["items"]))

    def test_bounds_validation_empty_out_of_range_and_live_deletes(self):
        for params in [{"limit": 101}, {"limit": 0}, {"offset": -1}, {"offset": 1000001}, {"sort": "source_text"}, {"status": "not-real"}, {"q": "x" * 201}, {"q": "a b c d e f g h i"}]:
            self.assertEqual(self.get("query/contracts", params).status_code, 422, params)
        self.assertEqual(self.get("query/tasks", {"due_after": "2026-10-18"}).status_code, 422)
        self.assertEqual(self.get("query/search", {"q": "x"}).status_code, 422)
        self.assertEqual(self.get("query/overview", {"day_start": self.day.isoformat(), "week_end": (self.day - timedelta(days=1)).isoformat()}).status_code, 422)
        for collection in ["contracts", "tasks", "lifecycle"]:
            page = self.get(f"query/{collection}", {"offset": 500}).json()
            self.assertEqual(page["items"], [])
            self.assertEqual(page["total"], 121)
            self.assertEqual(self.get(f"query/{collection}", {"q": "absent-needle"}).json()["total"], 0)
        with self.db.session_factory() as session:
            session.delete(session.get(WorkflowTask, "task-000000"))
            session.commit()
        page = self.get("query/tasks", {"offset": 120}).json()
        self.assertEqual(page["total"], 120)
        self.assertEqual(page["items"], [])

    def test_search_covers_parties_tasks_assignees_and_dates_without_source_bodies(self):
        for needle in ["supplier", "Action", "Synthetic owner", "2026-10-18"]:
            response = self.get("query/search", {"q": needle, "limit": 7})
            self.assertEqual(response.status_code, 200, response.text)
            result = response.json()
            self.assertLessEqual(len(result["items"]), 7)
            self.assertTrue(result["items"], needle)
            for row in result["items"]:
                self.assertEqual(set(row), {"id", "kind", "title", "meta", "href"})
                self.assertNotIn("description", row)
                self.assertNotIn("source_text", row)
        self.assertEqual(self.get("query/search", {"q": "100%"}).json()["items"][0]["id"], "contract-000000")

    def test_tenant_and_viewer_boundaries_and_private_headers(self):
        for route in ["query/contracts", "query/tasks", "query/lifecycle", "query/overview", "query/search?q=Supplier"]:
            self.assertEqual(self.get(route, organization_id=self.other_id).status_code, 403)
            response = self.get(route, organization_id=self.other_id, headers=self.other_headers)
            self.assertEqual(response.status_code, 200, response.text)
            if "items" in response.json():
                self.assertEqual(response.json()["items"], [])
            self.assertEqual(response.headers["cache-control"], "private, no-store")
        with self.db.session_factory() as session:
            other = session.scalar(select(User).where(User.external_subject == "other-owner"))
            session.add(Membership(organization_id=self.organization_id, user_id=other.id, role="viewer"))
            session.commit()
        for route in ["query/contracts", "query/tasks", "query/lifecycle", "query/overview", "query/search?q=Supplier"]:
            self.assertEqual(self.get(route, headers=self.other_headers).status_code, 200)

    def test_overview_aggregates_and_small_previews(self):
        response = self.get("query/overview", {"day_start": self.day.isoformat(), "week_end": (self.day + timedelta(days=8)).isoformat()})
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertEqual(result["counts"]["contracts"], 121)
        self.assertEqual(result["counts"]["ready"], 61)
        self.assertEqual(result["counts"]["failed"], 60)
        self.assertEqual(result["counts"]["active_tasks"], 80)
        self.assertEqual(result["counts"]["completed_tasks"], 41)
        self.assertEqual(result["counts"]["attention"], 121)
        for key, maximum in [("recent_contracts", 5), ("attention_contracts", 5), ("my_tasks", 5), ("upcoming_tasks", 4), ("upcoming_lifecycle", 4)]:
            self.assertLessEqual(len(result[key]), maximum)
        self.assertEqual(result["counts"]["overdue_tasks"] + result["counts"]["upcoming_tasks"], 80)

    def test_materialization_and_query_count_bounded_with_large_fixture_and_job_history(self):
        self.seed(879, start=121)
        with self.db.session_factory() as session:
            asset = DocumentAsset(organization_id=self.organization_id, contract_id="contract-000000", storage_key="synthetic/old.txt", original_name="old.txt", content_type="text/plain", size_bytes=4, sha256="0" * 64)
            session.add(asset)
            session.flush()
            session.add_all([ProcessingJob(id=f"job-{index:04}", organization_id=self.organization_id, contract_id="contract-000000", document_asset_id=asset.id, created_at=self.day + timedelta(seconds=index)) for index in range(100)])
            session.commit()
        loaded = []
        def job_loaded(target, _context):
            loaded.append(target.id)
        event.listen(ProcessingJob, "load", job_loaded)
        try:
            response, queries, _ = self.measured("query/contracts", {"limit": 10, "sort": "title", "descending": False})
        finally:
            event.remove(ProcessingJob, "load", job_loaded)
        self.assertEqual(response.json()["total"], 1000)
        self.assertEqual(len(response.json()["items"]), 10)
        self.assertEqual(loaded, ["job-0099"])
        self.assertLessEqual(queries, 6)
        for route in ["query/tasks", "query/lifecycle"]:
            page, queries, _ = self.measured(route, {"limit": 10})
            self.assertEqual(page.json()["total"], 1000)
            self.assertEqual(len(page.json()["items"]), 10)
            self.assertLessEqual(queries, 5)
        page, queries, _ = self.measured("query/overview")
        self.assertLessEqual(queries, 14)
        self.assertEqual(page.json()["counts"]["contracts"], 1000)


def benchmark(output=None):
    case = WorkspaceQueryTests()
    try:
        case.setUp()
        case.seed(879, start=121)
        results = {}
        for route in ["contracts", "tasks", "lifecycle", "query/contracts", "query/tasks", "query/lifecycle", "query/overview", "query/search?q=Supplier"]:
            case.measured(route)
            runs = [case.measured(route) for _ in range(5)]
            response = runs[0][0]
            value = response.json()
            results[route] = {
                "rows": len(value if isinstance(value, list) else value.get("items", [])),
                "total": len(value) if isinstance(value, list) else value.get("total"),
                "decoded_json_bytes": len(response.content), "gzip_json_bytes": len(gzip.compress(response.content)),
                "select_queries": runs[0][1], "median_ms": round(statistics.median(run[2] for run in runs), 2),
                "range_ms": [round(min(run[2] for run in runs), 2), round(max(run[2] for run in runs), 2)],
            }
        record = {"source_sha": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip(),
                  "fixture": "1000 contracts + 1000 tasks + 1000 lifecycle items; synthetic short text; no provider calls; same fixture for both routes",
                  "conditions": "FastAPI TestClient, disposable SQLite, one warmup then five samples; gzip bytes are calculated, not measured transport",
                  "results": results}
        rendered = json.dumps(record, indent=2) + "\n"
        print(rendered)
        if output:
            Path(output).write_text(rendered)
    finally:
        case.doCleanups()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--benchmark", action="store_true")
    parser.add_argument("--output")
    args, remaining = parser.parse_known_args()
    if args.benchmark:
        benchmark(args.output)
    else:
        unittest.main(argv=[__file__, *remaining])
