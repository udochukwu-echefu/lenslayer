"""Real PostgreSQL contention/recovery; skipped is not a passed database check."""
import unittest
from unittest.mock import patch

from tests import test_account_deletion as account_deletion
from tests import test_agent_infrastructure as infrastructure
from tests import test_calendar_workflows as calendar
from tests import test_hosted_agents as hosted
from tests import test_on_demand_workers as on_demand
from tests.postgres_support import DisposablePostgres, postgres_enabled


class PostgresFixture:
    def setUp(self):
        self.pg = DisposablePostgres()
        original_settings = infrastructure.Settings

        def settings(**kwargs):
            kwargs["database_url"] = self.pg.url
            return original_settings(**kwargs)

        self.settings_patches = [patch.object(module, "Settings", settings) for module in (infrastructure, account_deletion)]
        for item in self.settings_patches:
            item.start()
        try:
            super().setUp()
        except Exception:
            for item in self.settings_patches:
                item.stop()
            self.pg.close()
            raise

    def tearDown(self):
        try:
            super().tearDown()
        finally:
            for item in self.settings_patches:
                item.stop()
            self.pg.close()


@unittest.skipUnless(postgres_enabled(), "PostgreSQL disposable-schema suite not opted in")
class PostgresInfrastructureTests(PostgresFixture, infrastructure.AgentInfrastructureTests):
    pass


@unittest.skipUnless(postgres_enabled(), "PostgreSQL disposable-schema suite not opted in")
class PostgresAccountDeletionTests(PostgresFixture, account_deletion.AccountDeletionTests):
    pass


@unittest.skipUnless(postgres_enabled(), "PostgreSQL disposable-schema suite not opted in")
class PostgresCalendarTests(PostgresFixture, calendar.CalendarWorkflowTests):
    pass


@unittest.skipUnless(postgres_enabled(), "PostgreSQL hosted-task checks not opted in")
class PostgresHostedTests(PostgresFixture, hosted.HostedAgentTests):
    pass


@unittest.skipUnless(postgres_enabled(), "PostgreSQL on-demand wake/lease checks not opted in")
class PostgresOnDemandTests(PostgresFixture, on_demand.OnDemandWorkerTests):
    pass
