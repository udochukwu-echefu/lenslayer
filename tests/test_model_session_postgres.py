"""Real PostgreSQL global admission/session tests; provider HTTP remains mocked."""
import unittest

from tests.test_agent_postgres import PostgresFixture
from tests import test_hosted_lifetime_budget as lifetime_budget
from tests import test_provider_session_integration as provider_session
from tests.postgres_support import postgres_enabled


@unittest.skipUnless(postgres_enabled(), "Disposable PostgreSQL model budget checks not opted in")
class PostgresLifetimeBudgetTests(PostgresFixture, lifetime_budget.LifetimeBudgetTests):
    pass


@unittest.skipUnless(postgres_enabled(), "Disposable PostgreSQL trusted-session checks not opted in")
class PostgresProviderSessionTests(PostgresFixture, provider_session.ProviderSessionIntegrationTests):
    pass
