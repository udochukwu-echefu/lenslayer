#!/usr/bin/env python3
"""Opt-in real API/worker checks with disposable data and fake providers only."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from urllib.error import URLError
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener
from uuid import uuid4


REPO = Path(__file__).resolve().parents[1]


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def check_fixture(node: str, root: Path, name: str, module: str, scripts: list[str]) -> None:
    # A unique response nonce proves this is our child, even if another local
    # process races the temporary port. Never send writes to an unverified API.
    nonce = uuid4().hex
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    env = {"PATH": os.environ.get("PATH", ""), "PYTHONPATH": str(REPO),
           "LENSLAYER_AGENT_TEST_ROOT": str(root), "LENSLAYER_AGENT_TEST_NONCE": nonce,
           "LENSLAYER_AGENT_TEST_API_URL": base, "LENSLAYER_TEST_PYTHON": sys.executable}
    opener = build_opener(ProxyHandler({}), NoRedirect())
    with (root / "fixture.log").open("wb") as log:
        process = subprocess.Popen([sys.executable, "-m", "uvicorn", module + ":create_test_app",
            "--factory", "--host", "127.0.0.1", "--port", str(port), "--no-access-log",
            "--log-level", "warning"], cwd=REPO, env=env, stdout=log, stderr=log,
            stdin=subprocess.DEVNULL)
        try:
            deadline = time.monotonic() + 30
            while True:
                if process.poll() is not None:
                    raise RuntimeError(f"{name} fixture exited; no API writes were attempted.")
                try:
                    with opener.open(Request(base + "/__lenslayer_disposable_fixture"), timeout=1) as response:
                        identity = json.loads(response.read(4096))
                    if identity != {"fixture": name, "nonce": nonce}:
                        raise RuntimeError("Refusing an API that does not match the disposable fixture.")
                    break
                except (URLError, TimeoutError):
                    if time.monotonic() >= deadline:
                        raise RuntimeError(f"{name} fixture did not become ready; no API writes were attempted.") from None
                    time.sleep(0.2)
            for script in scripts:
                subprocess.run([node, script], cwd=REPO, env=env, check=True, timeout=180)
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", action="store_true", help="Acknowledge synthetic local API writes and temporary socket binding")
    args = parser.parse_args()
    if not args.run:
        parser.error("Pass --run to create and discard isolated test databases.")
    node = shutil.which("node")
    if not node:
        parser.error("Node.js is required.")
    for path in ("sdk/dist/index.js", "mcp/dist/stdio.js", "hosted-agent/dist/runner.js"):
        if not (REPO / path).is_file():
            parser.error("Build the SDK, MCP and planner first with make check-agents.")
    with tempfile.TemporaryDirectory(prefix="lenslayer-agent-check-") as folder:
        root = Path(folder)
        task = root / "tasks"
        task.mkdir(mode=0o700)
        check_fixture(node, task, "task-v1", "examples.agents.tests.local_backend",
            ["examples/agents/tests/verify-local-backend.mjs", "mcp/tests/local-backend-smoke.mjs"])
        calendar = root / "calendar"
        calendar.mkdir(mode=0o700)
        (calendar / "calendar-fixture-ack").touch(mode=0o600)
        check_fixture(node, calendar, "calendar-workflows", "examples.agents.tests.calendar_backend",
            ["mcp/tests/workflow-backend-smoke.mjs", "examples/agents/tests/verify-hosted-backend.mjs"])
    print("PASS: owned fixture processes stopped and disposable integration data removed.")


if __name__ == "__main__":
    main()
