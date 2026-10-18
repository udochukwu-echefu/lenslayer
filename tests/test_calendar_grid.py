"""Complete month/grid occupancy remains bounded on dense days and DST edges."""
from datetime import datetime, timedelta, timezone
import unittest
from unittest.mock import patch
from zoneinfo import ZoneInfo

from sqlalchemy import delete

from backend.app.models import LifecycleItem, WorkflowTask
from tests import test_workspace_queries as queries
from tests.postgres_support import DisposablePostgres, postgres_enabled


class CalendarGridTests(unittest.TestCase):
    seed = queries.WorkspaceQueryTests.seed
    get = queries.WorkspaceQueryTests.get
    measured = queries.WorkspaceQueryTests.measured

    def setUp(self):
        queries.WorkspaceQueryTests.setUp(self)
        with self.db.session_factory() as session:
            session.execute(delete(LifecycleItem))
            session.execute(delete(WorkflowTask))
            session.commit()

    def add_day(self, instant, count=1, prefix="day"):
        with self.db.session_factory() as session:
            for i in range(count):
                session.add(WorkflowTask(id=f"{prefix}-t-{i}", organization_id=self.organization_id, created_by_user_id=self.user_id,
                    contract_id="contract-000000", title="Synthetic task", status="open", due_at=instant))
                session.add(LifecycleItem(id=f"{prefix}-l-{i}", organization_id=self.organization_id, created_by_user_id=self.user_id,
                    contract_id="contract-000000", title="Synthetic notice", kind="notice", status="active", due_at=instant))
            session.commit()

    def grid(self, **params):
        return self.get("query/calendar", {"month": "2026-10-01", "grid_start": "2026-09-28", "timezone": "UTC", **params})

    def test_all_31_days_and_adjacent_days_independent_of_agenda_page_or_sort(self):
        for day in range(1, 32):
            self.add_day(datetime(2026, 10, day, 12, tzinfo=timezone.utc), prefix=str(day))
        self.add_day(datetime(2026, 9, 30, 12, tzinfo=timezone.utc), prefix="adjacent")
        initial = self.grid()
        self.assertEqual(initial.status_code, 200, initial.text)
        result = initial.json()
        self.assertEqual(result["month_total"], 62)
        self.assertEqual(result["grid_total"], 64)
        self.assertEqual(len(result["days"]), 42)
        days = {day["date"]: day for day in result["days"]}
        for day in range(1, 32):
            self.assertEqual(days[f"2026-10-{day:02}"]["total"], 2)
        for descending in (False, True):
            for offset in (0, 25):
                for kind in ("tasks", "lifecycle"):
                    self.assertEqual(self.get(f"query/{kind}", {"offset": offset, "descending": descending}).status_code, 200)
                self.assertEqual(self.grid().json(), result)

    def test_dense_day_keeps_rows_payload_and_queries_bounded_and_truthful(self):
        self.add_day(datetime(2026, 10, 18, tzinfo=timezone.utc), count=5)
        before, queries_before, _ = self.measured("query/calendar", {"month": "2026-10-01", "grid_start": "2026-09-28"})
        self.add_day(datetime(2026, 10, 18, tzinfo=timezone.utc), count=1000, prefix="dense")
        after, queries_after, _ = self.measured("query/calendar", {"month": "2026-10-01", "grid_start": "2026-09-28"})
        self.assertEqual(queries_after, queries_before)
        self.assertLessEqual(queries_after, 4)
        self.assertLess(len(after.content), len(before.content) + 100)
        day = next(day for day in after.json()["days"] if day["date"] == "2026-10-18")
        self.assertEqual(day["total"], 2010)
        self.assertEqual(len(day["items"]), 3)
        self.assertEqual(after.json()["month_total"], 2010)
        self.assertEqual(self.grid(month="2026-12-01", grid_start="2026-11-30").json()["grid_total"], 0)

    def test_dst_local_midnights_and_timezone_validation(self):
        tz = ZoneInfo("America/New_York")
        for month, day, grid_start, hours in [(3, 8, "2026-02-23", 23), (11, 1, "2026-10-26", 25)]:
            start = datetime(2026, month, day, tzinfo=tz).astimezone(timezone.utc)
            next_day = datetime(2026, month, day + 1, tzinfo=tz).astimezone(timezone.utc)
            self.assertEqual(next_day - start, timedelta(hours=hours))
            for name, instant in [("before", start - timedelta(microseconds=1)), ("start", start), ("last", next_day - timedelta(microseconds=1)), ("next", next_day)]:
                self.add_day(instant, prefix=f"{month}-{name}")
            result = self.grid(month=f"2026-{month:02}-01", grid_start=grid_start, timezone="America/New_York")
            self.assertEqual(result.status_code, 200, result.text)
            days = {row["date"]: row["total"] for row in result.json()["days"]}
            keys = [(start.astimezone(tz).date() + timedelta(days=i)).isoformat() for i in (-1, 0, 1)]
            self.assertEqual(tuple(days[key] for key in keys), (2, 4, 2))
        for invalid in [{"timezone": "Not/AZone"}, {"grid_start": "2026-01-01"}, {"month": "9999-12-01"}]:
            self.assertEqual(self.grid(**invalid).status_code, 422)

    def test_private_headers_and_tenant_denial(self):
        self.assertEqual(self.grid().headers["cache-control"], "private, no-store")
        params = {"month": "2026-10-01", "grid_start": "2026-09-28"}
        self.assertEqual(self.get("query/calendar", params, organization_id=self.other_id).status_code, 403)
        other = self.get("query/calendar", params, organization_id=self.other_id, headers=self.other_headers)
        self.assertEqual(other.json()["grid_total"], 0)


@unittest.skipUnless(postgres_enabled(), "Disposable PostgreSQL not opted in")
class CalendarGridPostgresTests(CalendarGridTests):
    def setUp(self):
        pg = DisposablePostgres()
        self.addCleanup(pg.close)
        original = queries.Settings
        def settings(**kwargs):
            kwargs["database_url"] = pg.url
            return original(**kwargs)
        self.enterContext(patch.object(queries, "Settings", settings))
        super().setUp()
