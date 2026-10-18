"""python -m tests.qa_retrieval_benchmark > docs/performance/batch5-retrieval.json

Disposable SQLite, synthetic strings, no model/scanner/network adapters.
"""
from datetime import timedelta
import json
from pathlib import Path
import platform
import statistics
import subprocess
import tempfile
import time

from sqlalchemy import select
import sqlalchemy

from backend.app.config import Settings
from backend.app.database import Database
from backend.app.models import Contract, ContractReview, Membership, Organization, User, utcnow
from backend.app.object_storage import LocalObjectStore
from backend.app.services import PlatformService
from backend.app.service_domains.qa import portfolio_documents


def run():
    output = {"source_sha": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip(),
              "working_tree": "Batch5 implementation (see accompanying commit)",
              "python": platform.python_version(), "sqlalchemy": sqlalchemy.__version__, "database": "disposable SQLite",
              "conditions": "same warm fixture per pair, three repetitions, no providers; no production latency claim", "samples": []}
    for count in (1, 100, 1000):
        with tempfile.TemporaryDirectory() as directory:
            settings = Settings(database_url=f"sqlite:///{directory}/qa.db", auth_mode="local")
            database = Database(settings)
            database.create_schema()
            with database.session_factory() as session:
                session.add_all([User(id="u", external_subject="synthetic"), Organization(id="org", name="Synthetic", slug="synthetic")])
                session.flush()
                session.add(Membership(user_id="u", organization_id="org", role="viewer"))
                for index in range(count):
                    id = f"c{index:04}"
                    session.add(Contract(id=id, organization_id="org", created_by_user_id="u", title="Synthetic agreement", source_name="fake.txt",
                                         retain_source_text=True, created_at=utcnow() - timedelta(days=3650 if index == 0 else 1)))
                    session.add(ContractReview(contract_id=id, organization_id="org", source_text=("Xenon " if index == 0 else "") + "Synthetic notice clause. " * 40))
                session.commit()
            samples = []
            for _ in range(3):
                with database.session_factory() as session:
                    service = PlatformService(session, settings, LocalObjectStore(Path(directory) / "objects"))
                    user = session.get(User, "u")
                    start = time.monotonic()
                    service.membership("org", user)
                    before = session.execute(select(Contract, ContractReview).join(ContractReview, ContractReview.contract_id == Contract.id)
                                             .where(Contract.organization_id == "org")).all()
                    before_ms = (time.monotonic() - start) * 1000
                    before_bytes = sum(len((r.source_text or r.analysis_json).encode()) for _, r in before)
                with database.session_factory() as session:
                    service = PlatformService(session, settings, LocalObjectStore(Path(directory) / "objects"))
                    user = session.get(User, "u")
                    start = time.monotonic()
                    after = portfolio_documents(service, "org", user, "notice")
                    after_ms = (time.monotonic() - start) * 1000
                    older = portfolio_documents(service, "org", user, "xenon")
                    assert [document.contract_id for document in older] == ["c0000"]
                    samples.append(dict(before_ms=round(before_ms, 3), after_ms=round(after_ms, 3),
                                        before_candidates=len(before), after_candidates=len(after), before_source_bytes=before_bytes,
                                        after_source_bytes=sum(len(d.text.encode()) for d in after), older_relevant_found=True))
            output["samples"].append(dict(workspace_contracts=count, repetitions=samples,
                                          before_median_ms=statistics.median(s["before_ms"] for s in samples),
                                          after_median_ms=statistics.median(s["after_ms"] for s in samples)))
            database.dispose()
    return output


if __name__ == "__main__":
    print(json.dumps(run(), indent=2))
