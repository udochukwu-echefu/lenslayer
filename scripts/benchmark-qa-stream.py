"""Whole-stream benchmark; fake provider, disposable SQLite, no live credentials.

Run this same file with WORKTREE OUTPUT arguments for both source revisions.
"""
import asyncio
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import time
from unittest.mock import patch

root, output = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
sys.path.insert(0, str(root))
for name in list(os.environ):
    if name.startswith(("LENSLAYER_", "GROQ_", "OPENAI_", "DEEPSEEK_", "GOOGLE_", "AWS_", "RESEND_")):
        del os.environ[name]
import dotenv
dotenv.load_dotenv = lambda *args, **kwargs: False
from backend.app.config import Settings
Settings.model_config["env_file"] = None
from backend.app.api import qa_stream
from backend.app.models import Contract, ContractReview, User
from sqlalchemy import event
from tests.test_qa_streaming import QAStreamingTests, Exchange


async def sample(count):
    fixture = QAStreamingTests()
    fixture.setUp()
    try:
        with fixture.db.session_factory() as session:
            user = session.get(User, "u")
            user.display_name, user.email = "Local user", ""
            for i in range(count - 1):
                key = f"synthetic-{i:05}"
                session.add(Contract(id=key, organization_id="org", created_by_user_id="u", title="Renewal notice", source_name="synthetic", retain_source_text=True))
                session.add(ContractReview(id=f"review-{key}", contract_id=key, organization_id="org", source_text="Renewal notice provision. " * 800))
            session.commit()
        results = []
        for trial in range(3):
            fixture.model.release = asyncio.Event()
            ranks, materialized, statements = [], [], []
            original = qa_stream.portfolio_documents
            def ranking(*args):
                start = time.perf_counter()
                documents = original(*args)
                ranks.append((time.perf_counter() - start) * 1000)
                materialized.append({"rows": len(documents), "source_bytes": sum(len(d.text.encode()) for d in documents)})
                return documents
            def capture(_conn, _cursor, statement, *_args):
                if statement.lstrip().startswith("SELECT"):
                    statements.append(statement)
            event.listen(fixture.db.engine, "before_cursor_execute", capture)
            try:
                with patch.object(qa_stream, "portfolio_documents", ranking), patch.object(qa_stream, "HEARTBEAT_SECONDS", 0.03):
                    started = time.perf_counter()
                    exchange = Exchange(fixture.app, "/api/v1/organizations/org/portfolio/questions/stream")
                    await exchange.until("answer")
                    first_ms = (time.perf_counter() - started) * 1000
                    pool_during = fixture.db.engine.pool.checkedout()
                    for _ in range(3):
                        await exchange.until("status")
                    fixture.model.release.set()
                    final = await exchange.finish()
                    total_ms = (time.perf_counter() - started) * 1000
                    assert final["completed"]
                results.append({"trial": trial + 1, "rank_passes": len(ranks), "rank_ms": ranks,
                    "materialized": materialized, "selects": len(statements), "hash_only_checks": sum("sha256" in s for s in statements),
                    "first_content_ms": first_ms, "total_ms": total_ms, "timings": final["timings"],
                    "pool_paused": pool_during, "pool_after": fixture.db.engine.pool.checkedout()})
            finally:
                event.remove(fixture.db.engine, "before_cursor_execute", capture)
        return {"portfolio_records": count, "source_bytes_each": len(("Renewal notice provision. " * 800).encode()), "runs": results}
    finally:
        fixture.tearDown()


async def main():
    data = {"source_sha": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip(),
        "python": platform.python_version(), "conditions": "disposable SQLite; 3 serial samples/size; 20KB synthetic sources; fake provider paused for 3 × 30ms heartbeat intervals; no paid calls; not total-provider speed proof", "samples": []}
    for count in (100, 1000):
        data["samples"].append(await sample(count))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(data, indent=2) + "\n")
    print(json.dumps(data, indent=2))


asyncio.run(main())
