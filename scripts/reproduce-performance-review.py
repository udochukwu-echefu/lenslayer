"""Re-run the owner's unchanged fake-scanner workload without overwriting evidence.

Usage: python scripts/reproduce-performance-review.py ORIGINAL_REPRODUCE_PY OUTPUT_DIR
Only harness import/output context changes; record the original digest and source.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("original", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    original = args.original.resolve()
    output = args.output.resolve()
    if output == original.parent:
        parser.error("Output must not replace the original evidence")
    output.mkdir(parents=True, exist_ok=True)
    source = original.read_bytes()
    # The original derives imports and results.json from __file__. Giving it an
    # output-local context and the explicit checkout on sys.path changes neither
    # fixture, request order, fake 1s scan, samples nor measured operations.
    sys.path.insert(0, str(root))
    namespace = {"__file__": str(output / "reproduce.py"), "__name__": "performance_review_fixture"}
    exec(compile(source, str(original), "exec"), namespace)
    namespace["main"]()
    (output / "harness.json").write_text(json.dumps({
        "original_sha256": hashlib.sha256(source).hexdigest(),
        "source_sha": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip(),
        "adaptations": ["checkout explicitly on sys.path", "__file__ points into separate output directory"],
        "workload_modified": False,
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()
