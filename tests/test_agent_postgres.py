"""Real PostgreSQL contention/recovery; skipped is not a passed database check."""
import unittest
from unittest.mock import patch

from tests import test_agent_infrastructure as infrastructure
from tests import test_calendar_workflows as calendar
from tests import test_hosted_agents as hosted
from tests.postgres_support import DisposablePostgres, postgres_enabled


class PostgresFixture:
    def setUp(self):
        self.pg = DisposablePostgres()
        original_settings = infrastructure.Settings

        def settings(**kwargs):
            kwargs["database_url"] = self.pg.url
            return original_settings(**kwargs)

        self.settings_patch = patch.object(infrastructure, "Settings", settings)
        self.settings_patch.start()
        try:
            super().setUp()
        except Exception:
            self.settings_patch.stop()
            self.pg.close()
            raise

    def tearDown(self):
        try:
            super().tearDown()
        finally:
            self.settings_patch.stop()
            self.pg.close()


@unittest.skipUnless(postgres_enabled(), "PostgreSQL disposable-schema suite not opted in")
class PostgresInfrastructureTests(PostgresFixture, infrastructure.AgentInfrastructureTests):
    pass


@unittest.skipUnless(postgres_enabled(), "PostgreSQL disposable-schema suite not opted in")
class PostgresCalendarTests(PostgresFixture, calendar.CalendarWorkflowTests):
    pass


@unittest.skipUnless(postgres_enabled(), "PostgreSQL hosted-task checks not opted in")
class PostgresHostedTests(PostgresFixture, hosted.HostedAgentTests):
    pass
