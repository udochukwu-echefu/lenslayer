"""Same API regressions on an explicitly opted-in disposable local PG schema."""
import json
from pathlib import Path
import unittest
from unittest.mock import patch

from sqlalchemy import func, select, text

from backend.app.models import Contract, WorkflowTask
from tests import test_workspace_queries as queries
from tests.postgres_support import DisposablePostgres, postgres_enabled


@unittest.skipUnless(postgres_enabled(), "Disposable local PostgreSQL not opted in; skipped is not validation")
class WorkspaceQueryPostgresTests(queries.WorkspaceQueryTests):
    def setUp(self):
        self.pg = DisposablePostgres()
        self.addCleanup(self.pg.close)
        original = queries.Settings
        def local_settings(**kwargs):
            kwargs["database_url"] = self.pg.url
            return original(**kwargs)
        self.enterContext(patch.object(queries, "Settings", local_settings))
        super().setUp()

    def test_read_only_explain_plans_on_disposable_synthetic_fixture(self):
        self.seed(879, start=121)
        statements = {
            "contract_page": select(Contract, func.count().over()).where(Contract.organization_id == self.organization_id).order_by(Contract.updated_at.desc(), Contract.id.desc()).limit(25),
            "task_page": select(WorkflowTask, func.count().over()).where(WorkflowTask.organization_id == self.organization_id, WorkflowTask.status == "open").order_by(WorkflowTask.due_at.asc().nulls_last(), WorkflowTask.id.asc()).limit(25),
            "contract_counts": select(func.count(Contract.id)).where(Contract.organization_id == self.organization_id),
        }
        plans = {}
        with self.db.engine.connect() as connection:
            version = connection.scalar(text("SELECT version()"))
            # Refresh fixture statistics only inside this disposable schema.
            # EXPLAIN ANALYZE below is restricted to SELECT statements.
            connection.execute(text("ANALYZE platform_contracts"))
            connection.execute(text("ANALYZE workflow_tasks"))
            for name, statement in statements.items():
                sql = str(statement.compile(dialect=connection.dialect, compile_kwargs={"literal_binds": True}))
                self.assertTrue(sql.lstrip().startswith("SELECT"))
                plans[name] = connection.execute(text("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + sql)).scalar()
        folder = Path(".lenslayer/performance-evidence")
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "postgres-query-plans.json").write_text(json.dumps({
            "scope": "Local disposable UUID schema; synthetic 1000 rows per collection; SELECT-only ANALYZE; no production access or index changes",
            "database_version": version, "plans": plans,
        }, indent=2) + "\n")


if __name__ == "__main__":
    unittest.main()
