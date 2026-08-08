import json
import unittest
from datetime import date

from kyc import evaluate_case, export_case, get_case, name_similarity, normalize_address


class VerifyReconciliationTests(unittest.TestCase):
    def setUp(self):
        self.today = date(2026, 7, 12)

    def test_name_and_address_normalization_accepts_harmless_variations(self):
        self.assertGreaterEqual(
            name_similarity("Tunde Olumide Balogun", "Tunde O. Balogun"),
            0.9,
        )
        self.assertEqual(
            normalize_address("22 Allen Avenue, Ikeja, Lagos"),
            normalize_address("22 Allen Ave, Ikeja, Lagos"),
        )

    def test_low_risk_case_is_approvable_and_explainable(self):
        evaluation = evaluate_case(get_case("KYC-2026-002"), self.today)
        self.assertEqual(evaluation["suggested_action"], "Approve")
        self.assertLess(evaluation["score"], 20)
        self.assertTrue(evaluation["findings"])
        self.assertTrue(evaluation["findings"][0]["evidence"])

    def test_expired_id_and_address_conflict_are_escalated(self):
        evaluation = evaluate_case(get_case("KYC-2026-001"), self.today)
        codes = {finding["code"] for finding in evaluation["findings"]}
        self.assertEqual(evaluation["suggested_action"], "Escalate")
        self.assertIn("expired_id", codes)
        self.assertIn("address_mismatch", codes)

    def test_material_identity_conflicts_are_rejected(self):
        evaluation = evaluate_case(get_case("KYC-2026-003"), self.today)
        codes = {finding["code"] for finding in evaluation["findings"]}
        self.assertEqual(evaluation["suggested_action"], "Reject")
        self.assertEqual(evaluation["score"], 100)
        self.assertIn("dob_mismatch", codes)
        self.assertIn("face_mismatch", codes)

    def test_export_includes_audit_history_and_synthetic_notice(self):
        case = get_case("KYC-2026-001")
        evaluation = evaluate_case(case, self.today)
        payload = json.loads(
            export_case(
                case,
                evaluation,
                [{"decision": "Escalate", "rationale": "Request a current ID."}],
            )
        )
        self.assertTrue(payload["evaluation"]["synthetic"])
        self.assertEqual(payload["decision_history"][0]["decision"], "Escalate")
        self.assertIn("Synthetic", payload["notice"])


if __name__ == "__main__":
    unittest.main()
