"""Package allowlisted synthetic performance reports, never arbitrary HAR/log data.

python scripts/package-performance-evidence.py /absolute/performance-evidence
Screenshots/HTML stay in the local evidence root; raw Lighthouse JSON is gzip
compressed without alteration, with original/packaged hashes for review.
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
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
    target = root / "docs/performance/evidence"
    target.mkdir(parents=True, exist_ok=True)
    files = [
        "workspace-queries.json", "qa-retrieval.json", "reproduction-combined/results.json", "reproduction-combined/harness.json",
        "infrastructure/observed-api-health.json", "landing/final-canonical/metadata.json", "landing/final-canonical/qa/visual.json",
        "startup/before/summary.json", "startup/final-public/summary.json",
        "startup/mobile-pair-before/fixture-traces.json", "startup/mobile-pair-after/fixture-traces.json",
        "startup/fixture-before-v2/fixture-traces.json", "startup/fixture-combined-v2/fixture-traces.json",
    ]
    raw = [f"landing/{phase}/run-{run}.report.json" for phase in ["baseline", "final-canonical"] for run in [1, 2, 3]]
    raw += [f"startup/{phase}/sample-{run}.report.json" for phase in ["before", "final-public"] for run in [1, 2, 3]]
    manifest = {"source_sha": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip(),
                "local_evidence_root": str(evidence), "synthetic_only": True,
                "baseline": "e16c4711eb1220c438aae4e74138a3da5581e392 (tree identical to 18f851679478d0b63fc54526031e558095fcb16f)",
                "files": []}

    def retain(source, relative, compress=False):
        if source.is_symlink():
            raise ValueError("Symlinked evidence is not permitted")
        data = source.read_bytes()
        json.loads(data)  # Only JSON reports, not copied credentials or log files.
        packaged = gzip.compress(data, mtime=0) if compress else data
        path = target / (relative + (".gz" if compress else ""))
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(packaged)
        manifest["files"].append({"path": str(path.relative_to(target)), "original_bytes": len(data),
                                  "sha256_original": hashlib.sha256(data).hexdigest(), "sha256_packaged": hashlib.sha256(packaged).hexdigest()})

    for name in files:
        retain(evidence / name, name)
    for name in raw:
        retain(evidence / name, name, True)
    retain(root / ".lenslayer/performance-evidence/postgres-query-plans.json", "postgres-query-plans.json")
    summary = {"landing": {}, "private_mobile": {}, "visuals": []}
    for phase in ["baseline", "final-canonical"]:
        runs = [json.loads((evidence / f"landing/{phase}/run-{i}.report.json").read_text()) for i in [1, 2, 3]]
        summary["landing"][phase] = {
            **{name: stats([r["audits"][name]["numericValue"] for r in runs]) for name in ["first-contentful-paint", "largest-contentful-paint", "cumulative-layout-shift", "total-blocking-time"]},
            "performance": stats([r["categories"]["performance"]["score"] * 100 for r in runs]),
            **{name: stats([sum(x[name] for x in r["audits"]["network-requests"]["details"]["items"]) for r in runs]) for name in ["transferSize", "resourceSize"]},
        }
    for phase in ["mobile-pair-before", "mobile-pair-after"]:
        traces = json.loads((evidence / f"startup/{phase}/fixture-traces.json").read_text())["traces"]
        summary["private_mobile"][phase] = {name: stats([next(m["time"] for m in r["timings"]["usefulContent"] if m["name"] == name) for r in traces]) for name in ["fixture-shell", "fixture-useful-tasks"]}
    before, after = evidence / "startup/mobile-pair-before", evidence / "startup/mobile-pair-after"
    for path in sorted(before.glob("*.styles.json")):
        left, right = path.read_bytes(), (after / path.name).read_bytes()
        summary["visuals"].append({"file": path.name, "identical": left == right, "before_sha256": hashlib.sha256(left).hexdigest(), "after_sha256": hashlib.sha256(right).hexdigest()})
        if left != right:
            raise ValueError("Visual style/geometry regression: " + path.name)
    (target / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    (target / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Retained {len(manifest['files'])} reports and {len(summary['visuals'])} exact visual comparisons in {target}")


if __name__ == "__main__":
    main()
