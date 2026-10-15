"""Offline graph preflight only. Never imports the app or connects to a database."""
import argparse
import ast
import hashlib
import json
from pathlib import Path

VERSIONS = Path(__file__).resolve().parents[1] / "backend/migrations/versions"
FINAL_HEAD = "c7a4e9d2b630"


def review_path(versions: Path, start: str, head: str = FINAL_HEAD) -> dict:
    graph, fingerprints = {}, {}
    for path in sorted(versions.glob("*.py")):
        values = {}
        content = path.read_bytes()
        for node in ast.parse(content).body:
            targets = node.targets if isinstance(node, ast.Assign) else [node.target] if isinstance(node, ast.AnnAssign) else []
            for target in targets:
                if isinstance(target, ast.Name) and target.id in {"revision", "down_revision", "depends_on"}:
                    values[target.id] = ast.literal_eval(node.value)
        if "revision" not in values:
            continue
        revision, parents = values["revision"], values["down_revision"]
        if not isinstance(revision, str) or revision in graph or values.get("depends_on") is not None:
            raise ValueError("Duplicate/unsupported migration identity or dependency; review required")
        parents = () if parents is None else (parents,) if isinstance(parents, str) else parents
        if not isinstance(parents, tuple) or not all(isinstance(p, str) for p in parents):
            raise ValueError("Unsupported migration parents")
        graph[revision] = parents
        fingerprints[path.name] = hashlib.sha256(content).hexdigest()
    if set(graph) - {p for parents in graph.values() for p in parents} != {head}:
        raise ValueError("Final source must have exactly the reviewed head")

    def ancestors(revision, visiting, order):
        if revision not in graph or revision in visiting:
            raise ValueError("Missing/cyclic migration history; never stamp around it")
        if revision in order:
            return
        for parent in graph[revision]:
            ancestors(parent, visiting | {revision}, order)
        order.append(revision)

    ordered = []
    ancestors(head, set(), ordered)
    applied = []
    if start != "fresh":
        ancestors(start, set(), applied)
    if not set(applied) <= set(ordered):
        raise ValueError("Starting revision is not in final history")
    return {"graph_only": True, "start": start, "head": head,
            "missing_revisions": [r for r in ordered if r not in applied],
            "migration_files_sha256": fingerprints,
            "warning": "Not database-shape, data-preservation, restored-clone acceptance or deployment authorization"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--versions-dir", type=Path, default=VERSIONS)
    parser.add_argument("--from-revision", required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(review_path(args.versions_dir, args.from_revision), indent=2))
    except (ValueError, OSError, SyntaxError) as error:
        parser.exit(1, str(error) + "\n")


if __name__ == "__main__":
    main()
