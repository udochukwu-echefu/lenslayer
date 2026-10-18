"""Retain only synthetic follow-up reports, without overwriting original evidence.

python scripts/package-performance-followup.py /absolute/performance-follow-up
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import statistics
import subprocess


def stats(values):
    return {"median": statistics.median(values), "min": min(values), "max": max(values)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("evidence", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    evidence = args.evidence.resolve()
    target = root / "docs/performance/follow-up"
    target.mkdir(parents=True, exist_ok=True)
    manifest = {"packaging_revision": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip(),
                "baseline": "ca704aa272d1dc00548726a22fda1f91a40c587e", "synthetic_only": True, "files": []}

    def retain(source, name):
        if source.is_symlink():
            raise ValueError("Symlinked report refused")
        data = source.read_bytes()
        parsed = json.loads(data)
        destination = target / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
        manifest["files"].append({"path": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
        return parsed

    summary = {"navigation": {}, "qa": {}, "postgres": {}, "visuals": []}
    for mode in ("diagnostic", "normal"):
        summary["navigation"][mode] = {}
        pair = {}
        for phase in ("before", "after"):
            folder = f"final-navigation-{mode}-{phase}"
            data = retain(evidence / folder / "fixture-traces.json", f"{folder}/fixture-traces.json")
            pair[phase] = data
            if len(data["traces"]) != 3 or any(v["errors"] for v in data["visuals"]):
                raise ValueError("Incomplete/erroring browser evidence")
            traces = data["traces"]
            summary["navigation"][mode][phase] = {
                "revision": data["revision"], "contracts_ms": stats([t["navigation"][1]["elapsed"] for t in traces]),
                "tasks_revisit_ms": stats([t["navigation"][2]["elapsed"] for t in traces]),
                "query_clients": [[s["mounts"] for s in t["navigation"][:3]] for t in traces],
                "shells": [[s["shellID"] for s in t["navigation"][:3]] for t in traces],
                "metadata_calls_first_sequence": {label: [sum(r["label"] == label for r in t["navigation"][2]["upstreamRequests"]) for t in traces] for label in ("me", "organizations")},
                "task_record_calls_first_sequence": [sum(r["label"] == "tasks" for r in t["navigation"][2]["upstreamRequests"]) for t in traces],
                "cancelled_filters": [t["navigation"][-1]["cancelled"] for t in traces],
            }
        if pair["before"]["harnessSHA256"] != pair["after"]["harnessSHA256"]:
            raise ValueError("Different browser harnesses in comparison")
    for path in sorted((evidence / "final-navigation-diagnostic-before").glob("*.styles.json")):
        before = path.read_bytes()
        after = (evidence / "final-navigation-diagnostic-after" / path.name).read_bytes()
        if before != after:
            raise ValueError("Public style/geometry changed: " + path.name)
        summary["visuals"].append({"file": path.name, "identical": True, "sha256": hashlib.sha256(before).hexdigest()})
    for phase in ("before", "after"):
        data = retain(evidence / f"qa-final-{phase}.json", f"qa-{phase}.json")
        retain(evidence / f"qa-unwarmed-{phase}.json", f"exploratory-qa-unwarmed-{phase}.json")
        summary["qa"][phase] = {str(sample["portfolio_records"]): {
            "first_content_ms": stats([r["first_content_ms"] for r in sample["runs"]]),
            "total_ms": stats([r["total_ms"] for r in sample["runs"]]),
            "rank_passes": [r["rank_passes"] for r in sample["runs"]],
            "selects": [r["selects"] for r in sample["runs"]],
            "full_text_bytes": [sum(m["source_bytes"] for m in r["materialized"]) for r in sample["runs"]],
            "pool_paused": [r["pool_paused"] for r in sample["runs"]],
        } for sample in data["samples"]}
    retain(evidence / "counts-and-pages.json", "counts-and-pages.json")
    retain(evidence / "owner-probe-baseline.json", "owner-probe-baseline.json")
    retain(root / ".lenslayer/performance-follow-up/upload-admission.json", "upload-admission.json")
    plans = retain(root / ".lenslayer/performance-follow-up/postgres-plans.json", "postgres-plans.json")
    for count, batch in plans["plans"].items():
        summary["postgres"][count] = {name: stats([sample[0]["Execution Time"] for sample in samples]) for name, samples in batch.items()}
    logs = {}
    for name in ("backend-postgres-final-691bf0b.log", "dashboard-final.log", "dashboard-lint-final.log",
                 "calendar-dst-final.log", "agents-final.log", "integration-final-ready.log",
                 "staging-node-final.log", "staging-python-final.log"):
        data = (evidence / name).read_bytes()
        logs[name] = {"sha256_local_log": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
    backend = (evidence / "backend-postgres-final-691bf0b.log").read_text()
    dashboard = (evidence / "dashboard-final.log").read_text()
    if not re.search(r"Ran 677 tests.*?OK \(skipped=3\)", backend, re.S) or not re.search(r"Tests\s+429 passed", dashboard):
        raise ValueError("Full local validation did not match expected passing totals")
    validation = {"product_revision": "691bf0b2f45244c1b1ae620306d975bb5c9bacdf",
        "backend": {"executed": 677, "external_only_skips": 3, "failures": 0, "databases": "disposable local SQLite + PostgreSQL17.11"},
        "dashboard": {"passed": 429, "files": 56, "lint_errors": 0, "existing_lint_warnings": 1, "production_build": "passed"},
        "calendar_strengthened_dst": {"passed": 8, "cases": "23/25-hour local midnights, SQLite and PostgreSQL"},
        "agent_clients": {"sdk": 89, "mcp": 10, "planner": 23, "external_example": 15, "builds_and_package_review": "passed"},
        "staging_helpers": {"node_passed": 58, "python_passed": 33, "live_services": False},
        "evaluation": "passed, 1 synthetic fixture", "disposable_integration": "passed after builds completed",
        "landing": "byte-identical source to #21; canonical production build/check passed",
        "ci": "Separate GitHub test result at the PR's current head; local passes are not CI evidence",
        "local_log_hashes": logs}
    (target / "validation.json").write_text(json.dumps(validation, indent=2) + "\n")
    manifest["files"].append({"path": "validation.json", "bytes": (target / "validation.json").stat().st_size,
                              "sha256": hashlib.sha256((target / "validation.json").read_bytes()).hexdigest()})
    (target / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    manifest["files"].append({"path": "summary.json", "bytes": (target / "summary.json").stat().st_size,
                              "sha256": hashlib.sha256((target / "summary.json").read_bytes()).hexdigest()})
    manifest["harnesses"] = {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in (
        "scripts/profile-startup-fixture.mjs", "scripts/benchmark-qa-stream.py", "tests/test_upload_admission.py", "tests/test_followup_postgres_plans.py")}
    (target / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Retained {len(manifest['files'])} synthetic reports and {len(summary['visuals'])} exact public visual comparisons")


if __name__ == "__main__":
    main()
