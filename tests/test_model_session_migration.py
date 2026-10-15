"""Additive SQLite migration + permanent spent ledger rollback/reupgrade checks."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from backend.app.config import Settings


class ModelSessionMigrationTests(unittest.TestCase):
    def test_additive_migration_keeps_spent_ledger_across_downgrade_and_reupgrade(self):
        with tempfile.TemporaryDirectory() as directory:
            engine = create_engine(f"sqlite:///{Path(directory) / 'migrated.db'}")
            settings = Settings(_env_file=None, database_url=str(engine.url), environment="test", auth_mode="local", auto_create_schema=False)
            config = Config("backend/alembic.ini")
            with engine.connect() as connection, patch("backend.app.config.get_settings", return_value=settings):
                config.attributes["connection"] = connection
                command.upgrade(config, "ab3d5e7f9012")
                self.assertNotIn("model_provider", [column["name"] for column in inspect(connection).get_columns("hosted_agent_tasks")])
                command.upgrade(config, "bf84e2c19a67")
                self.assertIn("model_provider", [column["name"] for column in inspect(connection).get_columns("hosted_agent_tasks")])
                self.assertEqual(inspect(connection).get_foreign_keys("hosted_model_reservations"), [])
                self.assertEqual(inspect(connection).get_foreign_keys("hosted_model_lifetime_budget"), [])
                connection.execute(text("INSERT INTO hosted_model_lifetime_budget(id,reserved_calls) VALUES ('global-product-model-v1',1)"))
                connection.execute(text("INSERT INTO hosted_model_reservations VALUES ('deleted-task','deleted-org','hash','selection','deepseek','deepseek-flash','high','0.319488',1048576,4096,CURRENT_TIMESTAMP)"))
                connection.commit()
                command.downgrade(config, "ab3d5e7f9012")
                self.assertNotIn("calendar_session_proofs", inspect(connection).get_table_names())
                self.assertEqual(connection.scalar(text("SELECT reserved_calls FROM hosted_model_lifetime_budget")), 1)
                connection.commit()
                command.upgrade(config, "bf84e2c19a67")
                self.assertEqual(connection.scalar(text("SELECT reserved_calls FROM hosted_model_lifetime_budget")), 1)
                self.assertEqual(connection.scalar(text("SELECT reserved_usd FROM hosted_model_reservations")), "0.319488")
            engine.dispose()
