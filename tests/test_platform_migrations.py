import tempfile
import unittest
from pathlib import Path

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import MetaData, Table, create_engine, inspect, select, text
from sqlalchemy.exc import IntegrityError

from backend.app.database import Base
from backend.app import agent_models, connector_models, hosted_agent_models, models  # noqa: F401
from tests.postgres_support import DisposablePostgres, postgres_enabled


class MigrationChecks:
    def check_migrations(self, engine):
        config = Config("backend/alembic.ini")

        def migrate(direction, revision):
            with engine.begin() as connection:
                config.attributes["connection"] = connection
                getattr(command, direction)(config, revision)

        migrate("upgrade", "6e8a2b4d9c10")
        preserved = {
            "organization_settings": {"id": "s", "organization_id": "o"},
            "public_api_keys": {"id": "k", "organization_id": "o", "created_by_user_id": "u", "name": "Preserved key", "key_prefix": "fake", "key_hash": "0" * 64},
            "external_shares": {"id": "e", "organization_id": "o", "contract_id": "c", "created_by_user_id": "u", "token_hash": "1" * 64, "expires_at": models.utcnow()},
        }
        with engine.begin() as connection:
            connection.execute(models.User.__table__.insert().values(id="u", external_subject="migration-u", email="u@example.test", display_name="Migration"))
            connection.execute(models.Organization.__table__.insert().values(id="o", name="Preserved", slug="migration-o"))
            connection.execute(models.Contract.__table__.insert().values(id="c", organization_id="o", created_by_user_id="u", title="Preserved contract", source_name="fake.txt"))
            for table, values in preserved.items():
                connection.execute(Base.metadata.tables[table].insert().values(**values))

        def uniqueness_is_preserved():
            with engine.connect() as connection:
                for table, column, values in (
                    ("organization_settings", "organization_id", {**preserved["organization_settings"], "id": "s2"}),
                    ("public_api_keys", "key_hash", {**preserved["public_api_keys"], "id": "k2"}),
                    ("external_shares", "token_hash", {**preserved["external_shares"], "id": "e2"})):
                    inspection = inspect(connection)
                    indexes = inspection.get_indexes(table)
                    constraints = inspection.get_unique_constraints(table)
                    self.assertTrue(any(i["column_names"] == [column] and i.get("unique", True) for i in indexes + constraints))
                    transaction = connection.begin_nested()
                    with self.assertRaises(IntegrityError):
                        connection.execute(Base.metadata.tables[table].insert().values(**values))
                    transaction.rollback()
                    self.assertEqual(connection.scalar(select(Base.metadata.tables[table].c.id)), preserved[table]["id"])

        uniqueness_is_preserved()
        migrate("upgrade", "9a2b4c6d8e10")
        with engine.begin() as connection:
            # Reflect the old schema: current ORM defaults must not accidentally
            # write columns which this historical revision does not yet contain.
            metadata = MetaData()
            principal = Table("agent_principals", metadata, autoload_with=connection)
            run = Table("agent_runs", metadata, autoload_with=connection)
            heartbeat = Table("agent_worker_heartbeats", metadata, autoload_with=connection)
            now = models.utcnow()
            connection.execute(principal.insert().values(id="historical-agent", organization_id="o", delegated_by_user_id="u",
                name="Historical", token_hash="2" * 64, token_prefix="fake", allowed_tools_json="[]", contract_ids_json="[]",
                assignee_ids_json="[]", require_approval=True, max_actions_per_run=1, expires_at=now, revision=0, created_at=now))
            connection.execute(run.insert().values(id="historical-run", organization_id="o", agent_id="historical-agent",
                idempotency_key="historical", request_sha256="3" * 64, goal="Preserved goal", contract_ids_json="[]",
                allowed_tools_json="[]", success_condition_json="{}", max_actions=1, status="failed", result_json="{}",
                error_code="historical", event_sequence=0, revision=0, deadline_at=now, created_at=now, updated_at=now))
            connection.execute(heartbeat.insert().values(worker_id="historical-worker", last_seen_at=now))
        migrate("upgrade", "head")
        with engine.begin() as connection:
            config.attributes["connection"] = connection
            command.check(config)
        with engine.connect() as connection:
            self.assertEqual(compare_metadata(MigrationContext.configure(connection, opts={"compare_type": True}), Base.metadata), [])
            self.assertEqual(connection.scalar(text("SELECT name FROM organizations WHERE id='o'")), "Preserved")
            self.assertEqual(connection.scalar(text("SELECT count(*) FROM organization_settings WHERE organization_id='o'")), 1)
            self.assertEqual(connection.scalar(text("SELECT execution_owner FROM agent_runs WHERE id='historical-run'")), "external_agent")
            self.assertEqual(connection.scalar(text("SELECT lane FROM agent_worker_heartbeats WHERE worker_id='historical-worker'")), "mixed")
            task_table = hosted_agent_models.HostedAgentTask.__table__
            task_values = dict(id="hosted-migration", organization_id="o", created_by_user_id="u", idempotency_key="one-key",
                request_json="{}", request_sha256="4" * 64, goal_type="calendar-event", goal="Preserved hosted goal",
                planner_mode="deterministic", deadline_at=models.utcnow())
            connection.execute(task_table.insert().values(**task_values))
            transaction = connection.begin_nested()
            with self.assertRaises(IntegrityError):
                connection.execute(task_table.insert().values(**{**task_values, "id": "duplicate-hosted"}))
            transaction.rollback()
            connection.commit()
        uniqueness_is_preserved()
        migrate("downgrade", "9a2b4c6d8e10")
        with engine.connect() as connection:
            self.assertNotIn("hosted_agent_tasks", inspect(connection).get_table_names())
            self.assertNotIn("execution_owner", [c["name"] for c in inspect(connection).get_columns("agent_runs")])
            self.assertNotIn("lane", [c["name"] for c in inspect(connection).get_columns("agent_worker_heartbeats")])
            self.assertEqual(connection.scalar(text("SELECT goal FROM agent_runs WHERE id='historical-run'")), "Preserved goal")
        migrate("upgrade", "head")
        with engine.connect() as connection:
            self.assertEqual(compare_metadata(MigrationContext.configure(connection), Base.metadata), [])
            self.assertEqual(connection.scalar(text("SELECT execution_owner FROM agent_runs WHERE id='historical-run'")), "external_agent")
        migrate("downgrade", "6e8a2b4d9c10")
        uniqueness_is_preserved()
        with engine.connect() as connection:
            self.assertNotIn("calendar_credentials", inspect(connection).get_table_names())
            self.assertNotIn("dispatch_intent_json", [c["name"] for c in inspect(connection).get_columns("agent_actions")])
        migrate("upgrade", "head")
        with engine.connect() as connection:
            self.assertEqual(compare_metadata(MigrationContext.configure(connection), Base.metadata), [])
            self.assertEqual(connection.scalar(text("SELECT name FROM organizations WHERE id='o'")), "Preserved")


class SQLitePlatformMigrationTests(MigrationChecks, unittest.TestCase):
    def test_full_metadata_roundtrip_and_uniqueness(self):
        with tempfile.TemporaryDirectory() as directory:
            engine = create_engine(f"sqlite:///{Path(directory) / 'migration.db'}")
            try:
                self.check_migrations(engine)
            finally:
                engine.dispose()


@unittest.skipUnless(postgres_enabled(), "PostgreSQL migration checks not opted in")
class PostgresPlatformMigrationTests(MigrationChecks, unittest.TestCase):
    def test_full_metadata_roundtrip_and_uniqueness(self):
        pg = DisposablePostgres()
        try:
            self.check_migrations(pg.engine)
        finally:
            pg.close()
