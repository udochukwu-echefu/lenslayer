"""Disposable local API/worker fixture; never loads provider credentials or .env."""
from __future__ import annotations

import argparse
import os
from pathlib import Path
from backend.app.application import create_app
from backend.app.config import Settings
from backend.app.document_intelligence import build_review_workflow
from backend.app.worker import run_worker


def test_settings() -> Settings:
    root = Path(os.environ["LENSLAYER_AGENT_TEST_ROOT"]).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return Settings(
        _env_file=None,
        environment="test",
        auth_mode="local",
        auto_create_schema=True,
        database_url=f"sqlite:///{root / 'agent-check.db'}",
        object_storage_root=root / "objects",
        email_backend="disabled",
        malware_scan_backend="signature",
        review_worker_job="",
    )


def fixture_workflow():
    return build_review_workflow(contract_analyzer=lambda _text, _context: {})


def create_test_app():
    settings = test_settings()
    app = create_app(settings, review_workflow_factory=fixture_workflow)
    nonce = os.environ.get("LENSLAYER_AGENT_TEST_NONCE")
    if nonce:
        @app.get("/__lenslayer_disposable_fixture", include_in_schema=False)
        def fixture_identity():
            return {"fixture": "task-v1", "nonce": nonce}
    return app


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run one real worker pass against the disposable agent fixture.")
    parser.add_argument("--worker", action="store_true", required=True)
    parser.parse_args()
    run_worker(test_settings(), once=True, review_workflow_factory=fixture_workflow)
