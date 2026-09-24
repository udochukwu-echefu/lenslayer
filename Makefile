PYTHON ?= .venv/bin/python
NPM ?= npm

.PHONY: check check-backend check-dashboard check-landing benchmark

check: check-backend check-dashboard check-landing

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

benchmark:
	$(PYTHON) -m tests.test_query_performance --benchmark
