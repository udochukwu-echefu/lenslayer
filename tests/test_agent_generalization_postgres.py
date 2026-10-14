"""Opt-in disposable local PostgreSQL graph/context and migration checks."""
import unittest
from unittest.mock import patch

from tests import test_agent_generalization as generalization
from tests.test_agent_postgres import PostgresFixture
from tests.postgres_support import DisposablePostgres, postgres_enabled


@unittest.skipUnless(postgres_enabled(), "PostgreSQL context/graph checks not opted in")
class PostgresGeneralizationTests(PostgresFixture, generalization.GeneralizationTests):
    pass


@unittest.skipUnless(postgres_enabled(), "PostgreSQL context/graph migration checks not opted in")
class PostgresGeneralizationMigrationTests(generalization.GeneralizationMigrationTests):
    def setUp(self):
        self.pg = DisposablePostgres()
        original = generalization.Settings
        self.settings_patch = patch.object(generalization, "Settings", side_effect=lambda **kwargs:
            original(**{**kwargs, "database_url": self.pg.url}))
        self.settings_patch.start()

    def tearDown(self):
        self.settings_patch.stop()
        self.pg.close()
