"""Real Alembic upgrades from both applied parents and fresh, never stamping."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import Boolean, DateTime, Integer, MetaData, String, Text, create_engine, inspect, select, text

from backend.app import agent_generalization_models, agent_models, connector_models, hosted_agent_models, models  # noqa: F401
from backend.app.database import Base
from tests.postgres_support import DisposablePostgres, postgres_enabled
from scripts.check_production_migration_path import review_path

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests/fixtures/production-migration"
HEAD = "c7a4e9d2b630"
PRODUCTION = "6b1d3e8f2c57"
STAGING = "bf84e2c19a67"


def migrate(engine, target="head", direction="upgrade"):
    config = Config(str(ROOT / "backend/alembic.ini"))
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        getattr(command, direction)(config, target)


def reflected(engine):
    metadata = MetaData()
    metadata.reflect(engine)
    return metadata


def seed_every_table(engine):
    """One synthetic row per historical application table, all FK edges retained."""
    metadata = reflected(engine)
    inserted = {}
    with engine.begin() as connection:
        for table in metadata.sorted_tables:
            if table.name == "alembic_version":
                continue
            values = {}
            for column in table.columns:
                if column.foreign_keys:
                    fk = next(iter(column.foreign_keys))
                    values[column.name] = inserted[fk.column.table.name][fk.column.name]
                elif isinstance(column.type, Boolean):
                    values[column.name] = False
                elif isinstance(column.type, Integer):
                    values[column.name] = 1
                elif isinstance(column.type, DateTime):
                    values[column.name] = models.utcnow().replace(microsecond=0)
                elif column.nullable:
                    values[column.name] = None
                elif column.name.endswith("_json"):
                    values[column.name] = "{}"
                else:
                    values[column.name] = ("synthetic-" + table.name + "-" + column.name)[:getattr(column.type, "length", None)]
            if table.name == "webhook_subscriptions" and "signing_secret" in table.c:
                values["signing_secret"] = "whsec_synthetic_preserved_only"
                values["signing_secret_hash"] = hashlib.sha256(values["signing_secret"].encode()).hexdigest()
            if table.name == "hosted_model_reservations":
                values["reserved_usd"] = "0.319488"
            connection.execute(table.insert().values(**values))
            inserted[table.name] = values
    return metadata


def data_digest(engine, metadata):
    # Reuse only the pre-upgrade columns, so additive columns do not hide changes
    # in any original value. No data or test signing keys enter the output logs.
    with engine.connect() as connection:
        return {table.name: hashlib.sha256(json.dumps(
            [list(row) for row in connection.execute(select(table).order_by(*table.primary_key.columns))],
            default=str, sort_keys=True).encode()).hexdigest()
            for table in metadata.sorted_tables if table.name != "alembic_version"}


class LineageChecks:
    def assert_raw_email_default_is_true(self, metadata, existing_preference=False):
        # Reflected table has no ORM Python default: omit the column entirely.
        with self.engine.begin() as connection:
            membership = metadata.tables["organization_memberships"]
            values = dict(connection.execute(select(membership)).mappings().one())
            original_id = values["id"]
            org = metadata.tables["organizations"]
            organization = dict(connection.execute(select(org)).mappings().one())
            organization.update(id="second-org", slug="second-org")
            connection.execute(org.insert().values(**organization))
            values.update(id="default-membership", organization_id="second-org")
            values.pop("email_notifications")
            connection.execute(membership.insert().values(**values))
            self.assertTrue(connection.scalar(select(membership.c.email_notifications).where(membership.c.id == "default-membership")))
            self.assertEqual(connection.scalar(select(membership.c.email_notifications).where(membership.c.id == original_id)), existing_preference)

    def assert_head_and_metadata(self):
        with self.engine.connect() as connection:
            self.assertEqual(list(connection.scalars(text("SELECT version_num FROM alembic_version"))), [HEAD])
            self.assertEqual(compare_metadata(MigrationContext.configure(connection, opts={"compare_type": True}), Base.metadata), [])
            self.assertEqual(connection.exec_driver_sql("PRAGMA foreign_key_check").all() if self.engine.dialect.name == "sqlite" else [], [])
        config = Config(str(ROOT / "backend/alembic.ini"))
        with self.engine.begin() as connection:
            config.attributes["connection"] = connection
            command.check(config)

    def test_production_branch_matches_saved_columns_and_preserves_every_table(self):
        migrate(self.engine, PRODUCTION)
        evidence = json.loads((FIXTURES / "production-schema-shape.json").read_text())
        expected = {(c["table_name"], c["column_name"]): c for c in evidence["columns"]}
        actual = {(table, c["name"]): c for table in inspect(self.engine).get_table_names()
                  for c in inspect(self.engine).get_columns(table)}
        self.assertEqual(set(actual), set(expected))
        self.assertEqual(len(inspect(self.engine).get_table_names()), 33)
        for key, column in actual.items():
            saved = expected[key]
            self.assertEqual(column["nullable"], saved["is_nullable"] == "YES", key)
            self.assertEqual(getattr(column["type"], "length", None), saved["character_maximum_length"], key)
            expected_type = {"boolean": Boolean, "integer": Integer, "text": Text,
                             "character varying": String, "timestamp with time zone": DateTime}[saved["data_type"]]
            self.assertIsInstance(column["type"], expected_type, key)
            if saved["data_type"] == "timestamp with time zone" and self.engine.dialect.name == "postgresql":
                self.assertTrue(column["type"].timezone, key)
        baseline = seed_every_table(self.engine)
        before = data_digest(self.engine, baseline)
        self.assertEqual(len(before), 32)  # plus Alembic's version table
        migrate(self.engine)
        self.assertEqual(data_digest(self.engine, baseline), before)
        self.assert_head_and_metadata()
        with self.engine.connect() as connection:
            self.assertFalse(connection.scalar(select(models.Membership.email_notifications)))
            self.assertEqual(connection.scalar(select(models.WebhookSubscription.signing_secret)), "whsec_synthetic_preserved_only")
        # Reapplying head is a no-op, including the actual legacy key/opt-out.
        migrate(self.engine)
        self.assertEqual(data_digest(self.engine, baseline), before)
        self.assert_raw_email_default_is_true(baseline)

    def test_applied_staging_branch_preserves_graphs_and_spent_reservations(self):
        migrate(self.engine, STAGING)
        self.assertNotIn("email_notifications", {c["name"] for c in inspect(self.engine).get_columns("organization_memberships")})
        baseline = seed_every_table(self.engine)
        before = data_digest(self.engine, baseline)
        migrate(self.engine)
        self.assertEqual(data_digest(self.engine, baseline), before)
        self.assert_head_and_metadata()
        with self.engine.connect() as connection:
            self.assertTrue(connection.scalar(select(models.Membership.email_notifications)))
            self.assertIsNone(connection.scalar(select(models.WebhookSubscription.signing_secret)))
            self.assertEqual(connection.scalar(text("SELECT reserved_calls FROM hosted_model_lifetime_budget")), 1)
            self.assertEqual(connection.scalar(text("SELECT reserved_usd FROM hosted_model_reservations")), "0.319488")
        self.assert_raw_email_default_is_true(reflected(self.engine), existing_preference=True)

    def test_fresh_database_converges_and_server_default_is_true(self):
        migrate(self.engine)
        self.assert_head_and_metadata()
        baseline = seed_every_table(self.engine)
        self.assert_raw_email_default_is_true(baseline)

    def test_final_merge_refuses_destructive_downgrade_without_data_loss(self):
        migrate(self.engine)
        baseline = seed_every_table(self.engine)
        before = data_digest(self.engine, baseline)
        for target in (STAGING, PRODUCTION, "base"):
            with self.subTest(target=target), self.assertRaisesRegex(RuntimeError, "forward-only"):
                migrate(self.engine, target, "downgrade")
            self.assertEqual(data_digest(self.engine, baseline), before)
            self.assert_head_and_metadata()


class SQLiteLineageTests(LineageChecks, unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.engine = create_engine(f"sqlite:///{Path(self.temporary.name) / 'lineage.db'}")

    def tearDown(self):
        self.engine.dispose()
        self.temporary.cleanup()

    def assert_default_drift_is_refused(self, default):
        migrate(self.engine, PRODUCTION)
        baseline = seed_every_table(self.engine)
        before = data_digest(self.engine, baseline)
        with self.engine.begin() as connection:
            # Actual schema change in a synthetic DB already at authentic 6b1;
            # do not mirror the merge validator or modify Alembic version state.
            with Operations(MigrationContext.configure(connection)).batch_alter_table("organization_memberships") as batch:
                batch.alter_column("email_notifications", existing_type=Boolean(),
                                   existing_nullable=False, server_default=default)
        self.assertEqual(data_digest(self.engine, baseline), before)
        default_before = next(c["default"] for c in inspect(self.engine).get_columns("organization_memberships") if c["name"] == "email_notifications")
        with self.assertRaisesRegex(RuntimeError, "email default"):
            migrate(self.engine)
        self.assertEqual(data_digest(self.engine, baseline), before)
        with self.engine.connect() as connection:
            self.assertNotIn(HEAD, list(connection.scalars(text("SELECT version_num FROM alembic_version"))))
            self.assertFalse(connection.scalar(select(models.Membership.email_notifications)))
            self.assertEqual(connection.scalar(select(models.WebhookSubscription.signing_secret)), "whsec_synthetic_preserved_only")
        default_after = next(c["default"] for c in inspect(self.engine).get_columns("organization_memberships") if c["name"] == "email_notifications")
        self.assertEqual(default_after, default_before)  # Fail closed; no schema repair.

    def test_applied_production_false_default_stops_without_repair_or_optout_reset(self):
        self.assert_default_drift_is_refused(text("0"))

    def test_applied_production_missing_default_stops_without_repair_or_optout_reset(self):
        self.assert_default_drift_is_refused(None)

    def test_applied_production_unknown_expression_default_stops_without_repair(self):
        self.assert_default_drift_is_refused(text("true AND true"))


@unittest.skipUnless(postgres_enabled(), "Local disposable PostgreSQL not opted in")
class PostgresLineageTests(LineageChecks, unittest.TestCase):
    def setUp(self):
        self.pg = DisposablePostgres()
        self.engine = self.pg.engine

    def tearDown(self):
        self.pg.close()


class HistoricalIdentityTests(unittest.TestCase):
    def test_email_default_accepts_only_known_literal_semantics_for_each_dialect(self):
        path = ROOT / "backend/migrations/versions/c7a4e9d2b630_merge_production_and_agent_history.py"
        spec = importlib.util.spec_from_file_location("reviewed_compatibility_merge", path)
        merge = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(merge)
        for value in ["1", "true", "TRUE", "(1)", "((true))", " ( ( 1 ) ) "]:
            with self.subTest(dialect="sqlite", value=value):
                self.assertTrue(merge.historical_true_default(value, "sqlite"))
        for value in ["true", "((TRUE))", "true::boolean", "(true)::bool", "'true'::boolean",
                      "(('t'::pg_catalog.bool))", "((('1')::boolean))", "true::boolean::boolean"]:
            with self.subTest(dialect="postgresql", value=value):
                self.assertTrue(merge.historical_true_default(value, "postgresql"))
        for dialect in ["sqlite", "postgresql"]:
            for value in [None, "", "0", "false", "(false)", "'false'::boolean", "'f'::bool", "'0'::boolean",
                          "NULL", "1 + 0", "true AND true", "coalesce(true, false)", "'t rue'::boolean",
                          "true; SELECT 1", "true /* comment */", "(true))", "((true)", "'true'",
                          "(" * 20 + "true" + ")" * 20, True, 1]:
                with self.subTest(dialect=dialect, value=value):
                    self.assertFalse(merge.historical_true_default(value, dialect))
        self.assertFalse(merge.historical_true_default("true::boolean", "sqlite"))
        self.assertFalse(merge.historical_true_default("1", "postgresql"))
        self.assertFalse(merge.historical_true_default("true", "unknown"))

    def test_portable_fixture_set_and_schema_digest(self):
        self.assertEqual({p.name for p in FIXTURES.iterdir() if p.is_file()},
                         {"production-schema-shape.json", "6b1d3e8f2c57_webhook_signing_and_email_preferences.py"})
        self.assertEqual(hashlib.sha256((FIXTURES / "production-schema-shape.json").read_bytes()).hexdigest(),
                         "e69cf01a451f8aeb4cc42bc68075674888ef563969076d63404e80abdbe42646")

    def test_graph_preflight_handles_both_applied_branches_and_rejects_unknown_revision(self):
        versions = ROOT / "backend/migrations/versions"
        self.assertEqual(review_path(versions, STAGING)["missing_revisions"], [PRODUCTION, HEAD])
        production = review_path(versions, PRODUCTION)["missing_revisions"]
        self.assertEqual(production[0], "6e8a2b4d9c10")
        self.assertEqual(production[-1], HEAD)
        self.assertNotIn(PRODUCTION, production)
        fresh = review_path(versions, "fresh")["missing_revisions"]
        self.assertEqual(len(fresh), 18)
        self.assertEqual(len(fresh), len(set(fresh)))
        with self.assertRaises(ValueError):
            review_path(versions, "unknown")

    def test_original_migration_bytes_and_both_applied_parents_are_retained(self):
        name = "6b1d3e8f2c57_webhook_signing_and_email_preferences.py"
        original = (FIXTURES / name).read_bytes()
        self.assertEqual(hashlib.sha256(original).hexdigest(),
                         "c77f1642e6e1b42a4b72befb7cc88517305e1e4144f31917043a104121908630")
        self.assertEqual(original, (ROOT / "backend/migrations/versions" / name).read_bytes())
        scripts = ScriptDirectory.from_config(Config(str(ROOT / "backend/alembic.ini")))
        self.assertEqual(scripts.get_heads(), [HEAD])
        self.assertEqual(scripts.get_revision(PRODUCTION).down_revision, "4d2c8f1a9e77")
        self.assertEqual(scripts.get_revision("6e8a2b4d9c10").down_revision, "4d2c8f1a9e77")
        self.assertEqual(set(scripts.get_revision(HEAD).down_revision), {PRODUCTION, STAGING})
