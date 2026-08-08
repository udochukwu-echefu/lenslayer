import json
import unittest
from pathlib import Path

from evaluation import aggregate, evaluate_case


class EvaluationTests(unittest.TestCase):
    def test_fixture_passes_grounding_gate(self):
        fixture = json.loads(
            (Path(__file__).parents[1] / "evaluation_fixtures" / "synthetic_lease.json").read_text()
        )
        result = evaluate_case(fixture)
        self.assertEqual(result["quote_support"], 1.0)
        self.assertEqual(result["expected_risk_recall"], 1.0)
        self.assertTrue(aggregate([result])["passed"])

    def test_unsupported_quote_is_reported(self):
        case = {
            "source_text": "The agreement starts today.",
            "analysis": {
                "contract_type": "Agreement",
                "executive_summary": "Summary",
                "overall_attention": "Low",
                "risk_assessment": [
                    {"title": "Invented", "citation": "Line 1", "quote": "This text does not exist"}
                ],
                "missing_protections": [],
                "negotiation_priorities": [],
                "obligations": [],
                "uncertainties": [],
            },
        }
        result = evaluate_case(case)
        self.assertEqual(result["quote_support"], 0.0)
        self.assertEqual(result["unsupported_quotes"], ["This text does not exist"])


if __name__ == "__main__":
    unittest.main()
