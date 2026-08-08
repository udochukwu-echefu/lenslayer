import unittest

from playbooks import DEFAULT_PLAYBOOK, evaluate_report, finding_key


class PlaybookTests(unittest.TestCase):
    def test_high_risk_matching_rule_escalates(self):
        report = {
            "risk_assessment": [
                {
                    "title": "Unlimited liability",
                    "clause": "The supplier has unlimited liability",
                    "risk_level": "High",
                    "citation": "Section 9",
                    "quote": "unlimited liability",
                }
            ],
            "missing_protections": [],
        }
        result = evaluate_report(report, DEFAULT_PLAYBOOK)
        liability = next(item for item in result["deviations"] if item["rule_id"] == "liability")
        self.assertEqual(liability["status"], "Escalate")
        self.assertEqual(liability["citation"], "Section 9")
        termination = next(item for item in result["deviations"] if item["rule_id"] == "termination")
        self.assertEqual(termination["status"], "Not detected")
        self.assertEqual(termination["matched_finding"], "")
        self.assertEqual(termination["quote"], "")

    def test_finding_keys_are_stable(self):
        finding = {"title": "Termination", "citation": "Line 4", "quote": "terminate"}
        self.assertEqual(finding_key(finding, 1), finding_key(finding, 1))


if __name__ == "__main__":
    unittest.main()
