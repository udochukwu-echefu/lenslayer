"""Measured SELECT-only plans on larger synthetic data; never production DDL."""
import hashlib
import json
from pathlib import Path
import subprocess
import unittest

from sqlalchemy import event, insert, select, text, func

from backend.app.models import Contract, ContractReview, User, WorkflowTask
from backend.app.services import PlatformService
from backend.app.service_domains.qa import portfolio_documents
from tests import test_workspace_queries_postgres as fixtures
from tests.postgres_support import postgres_enabled


@unittest.skipUnless(postgres_enabled(), "Disposable local PostgreSQL not opted in")
class FollowupPlanTests(unittest.TestCase):
    def test_representative_ranking_window_sort_deep_offset_plans(self):
        fixture = fixtures.WorkspaceQueryPostgresTests()
        fixture.setUp()
        try:
            service_app = fixture.client.app.state
            plans = {}
            for count in (1000, 10000):
                start = 0 if count == 1000 else 1000
                with fixture.db.session_factory() as session:
                    for offset in range(start, count, 500):
                        ids = list(range(offset, min(offset + 500, count)))
                        session.execute(insert(Contract), [dict(id=f"large-{i:05}", organization_id=fixture.organization_id, created_by_user_id=fixture.user_id,
                            title=f"Supplier agreement {i:05}", source_name="synthetic.txt", retain_source_text=True, status="ready") for i in ids])
                        session.execute(insert(ContractReview), [dict(id=f"large-review-{i:05}", contract_id=f"large-{i:05}", organization_id=fixture.organization_id,
                            source_text=("Renewal notice thirty days. " if i % 20 == 0 else "Synthetic ordinary agreement. ") + " ".join(hashlib.sha256(f"{i}-{j}".encode()).hexdigest() for j in range(64))) for i in ids])
                        session.execute(insert(WorkflowTask), [dict(id=f"large-task-{i:05}", organization_id=fixture.organization_id, created_by_user_id=fixture.user_id,
                            title=f"Synthetic task {i:05}", contract_id=f"large-{i:05}", due_at=fixture.day, status="open") for i in ids])
                    session.commit()
                captured = []
                def capture(_conn, _cursor, statement, parameters, *_args):
                    if statement.lstrip().startswith("SELECT") and "ORDER BY" in statement and "CASE WHEN" in statement:
                        captured.append((statement, parameters))
                with fixture.db.session_factory() as session:
                    service = PlatformService(session, service_app.settings, service_app.object_store, service_app.review_workflow)
                    event.listen(fixture.db.engine, "before_cursor_execute", capture)
                    try:
                        portfolio_documents(service, fixture.organization_id, session.get(User, fixture.user_id), "renewal notice")
                    finally:
                        event.remove(fixture.db.engine, "before_cursor_execute", capture)
                with fixture.db.engine.connect() as connection:
                    for table in ("platform_contracts", "contract_reviews", "workflow_tasks"):
                        connection.execute(text(f"ANALYZE {table}"))
                    rank, parameters = captured[0]
                    statements = {
                        "like_ranking": (rank, parameters),
                        "window_first_page": (select(Contract, func.count().over()).where(Contract.organization_id == fixture.organization_id).order_by(Contract.updated_at.desc(), Contract.id.desc()).limit(25), None),
                        "window_deep_offset": (select(Contract, func.count().over()).where(Contract.organization_id == fixture.organization_id).order_by(Contract.updated_at.desc(), Contract.id.desc()).offset(count - 100).limit(25), None),
                        "filtered_title_sort": (select(Contract, func.count().over()).where(Contract.organization_id == fixture.organization_id, Contract.title.icontains("Supplier", autoescape=True)).order_by(Contract.title, Contract.id).limit(25), None),
                    }
                    batch = {}
                    for name, (statement, params) in statements.items():
                        sql = statement if isinstance(statement, str) else str(statement.compile(dialect=connection.dialect, compile_kwargs={"literal_binds": True}))
                        self.assertTrue(sql.lstrip().startswith("SELECT"))
                        batch[name] = [connection.exec_driver_sql("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + sql, params).scalar() for _ in range(3)]
                    plans[str(count)] = batch
                    version = connection.scalar(text("SELECT version()"))
            folder = Path(".lenslayer/performance-follow-up")
            folder.mkdir(parents=True, exist_ok=True)
            (folder / "postgres-plans.json").write_text(json.dumps({"source_sha": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip(),
                "database_version": version, "fixture": "1000 then10000 synthetic contracts/reviews/tasks plus121 baseline rows, ~4KB mixed non-repetitive source text, 5% renewal matches. 3 EXPLAIN ANALYZE samples/query/size; local UUID schema only. No index DDL.", "plans": plans}, indent=2))
        finally:
            fixture.doCleanups()
