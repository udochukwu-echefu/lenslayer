"""Offline quality evaluation for Lenslayer reports.

Fixtures contain synthetic source text plus a saved report. This keeps CI
deterministic and makes regressions visible without calling a hosted model.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


MATERIAL_COLLECTIONS = ("key_terms", "risk_assessment", "obligations")
REQUIRED_REPORT_FIELDS = {
    "contract_type",
    "executive_summary",
    "overall_attention",
    "risk_assessment",
    "missing_protections",
    "negotiation_priorities",
    "obligations",
    "uncertainties",
}


def _normalise(text: str) -> str:
    text = re.sub(r"\[(?:L\d+|PAGE\s+\d+)\]", " ", text or "", flags=re.IGNORECASE)
    return " ".join(text.lower().split())


def _material_findings(report: dict[str, Any]) -> list[dict[str, Any]]:
    return [item for collection in MATERIAL_COLLECTIONS for item in report.get(collection, [])]


def evaluate_case(case: dict[str, Any]) -> dict[str, Any]:
    report = case.get("analysis", {})
    source = _normalise(case.get("source_text", ""))
    findings = _material_findings(report)
    cited = [item for item in findings if item.get("citation") and item.get("quote")]
    supported = [item for item in cited if _normalise(str(item.get("quote"))) in source]
    expected_phrases = [str(item).lower() for item in case.get("expected_risk_phrases", [])]
    risk_text = _normalise(" ".join(str(value) for item in report.get("risk_assessment", []) for value in item.values()))
    expected_hits = [phrase for phrase in expected_phrases if phrase in risk_text]
    expected_attention = case.get("expected_overall_attention")
    return {
        "case_id": case.get("id") or "case",
        "schema_completeness": len(REQUIRED_REPORT_FIELDS.intersection(report)) / len(REQUIRED_REPORT_FIELDS),
        "citation_coverage": len(cited) / len(findings) if findings else 1.0,
        "quote_support": len(supported) / len(cited) if cited else 1.0,
        "expected_risk_recall": len(expected_hits) / len(expected_phrases) if expected_phrases else 1.0,
        "attention_match": expected_attention is None or report.get("overall_attention") == expected_attention,
        "unsupported_quotes": [item.get("quote") for item in cited if item not in supported],
        "missed_expectations": [item for item in expected_phrases if item not in expected_hits],
    }


def aggregate(results: list[dict[str, Any]]) -> dict[str, Any]:
    if not results:
        return {"cases": 0, "passed": False}
    averages = {
        metric: sum(float(item[metric]) for item in results) / len(results)
        for metric in ("schema_completeness", "citation_coverage", "quote_support", "expected_risk_recall")
    }
    attention_accuracy = sum(bool(item["attention_match"]) for item in results) / len(results)
    passed = (
        averages["schema_completeness"] >= 0.95
        and averages["citation_coverage"] >= 0.90
        and averages["quote_support"] >= 0.95
        and averages["expected_risk_recall"] >= 0.80
        and attention_accuracy >= 0.80
    )
    return {"cases": len(results), **averages, "attention_accuracy": attention_accuracy, "passed": passed}


def load_fixtures(path: Path) -> list[dict[str, Any]]:
    if path.is_file():
        return [json.loads(path.read_text(encoding="utf-8"))]
    return [json.loads(item.read_text(encoding="utf-8")) for item in sorted(path.glob("*.json"))]


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate saved Lenslayer reports against synthetic fixtures.")
    parser.add_argument("path", nargs="?", default="evaluation_fixtures")
    parser.add_argument("--output", help="Optional JSON output file")
    args = parser.parse_args()
    results = [evaluate_case(case) for case in load_fixtures(Path(args.path))]
    payload = {"summary": aggregate(results), "results": results}
    rendered = json.dumps(payload, indent=2)
    if args.output:
        Path(args.output).write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    return 0 if payload["summary"]["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
