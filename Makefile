PYTHON ?= .venv/bin/python
NPM ?= npm

.PHONY: check check-backend check-dashboard check-landing check-agents check-agent-postgres check-agent-integration prepare-staging benchmark

check: check-backend check-dashboard check-landing check-agents

check-backend:
	$(PYTHON) -m unittest discover -s tests -v
	$(PYTHON) -m evaluation evaluation_fixtures

check-dashboard:
	$(NPM) --prefix dashboard run lint
	$(NPM) --prefix dashboard test
	$(NPM) --prefix dashboard run build

check-landing:
	$(NPM) --prefix landing run check
	$(NPM) --prefix landing run build

check-agents:
	$(NPM) --prefix sdk run release:check
	$(NPM) --prefix mcp test
	$(NPM) --prefix hosted-agent test
	$(NPM) --prefix examples/agents test

check-agent-postgres:
	$(PYTHON) -c 'import os, sys; sys.exit(0 if os.getenv("LENSLAYER_TEST_POSTGRES_ACK") == "create_disposable_schema" and os.getenv("LENSLAYER_TEST_POSTGRES_URL") else "Set the disposable PostgreSQL URL and acknowledgment first")'
	$(PYTHON) -m unittest discover -s tests -p test_agent_postgres.py -v
	$(PYTHON) -m unittest discover -s tests -p test_platform_migrations.py -v

check-agent-integration:
	$(PYTHON) scripts/verify-agent-integrations.py --run

STAGING_REVIEW_DIR ?= /private/tmp/lenslayer-staging-review
prepare-staging:
	$(PYTHON) scripts/prepare-staging.py --output-dir "$(STAGING_REVIEW_DIR)"

benchmark:
	$(PYTHON) -m tests.test_query_performance --benchmark
