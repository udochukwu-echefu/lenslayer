import copy
import json
import unittest

from backend.app.models import utcnow
from backend.app.review_errors import PROCESSING_PROGRESS, PUBLIC_MESSAGES
from backend.app.schemas import AuditEventResponse, ContractActivityResponse, JobResponse, ReportActivityItem


class ReviewErrorSerializationTests(unittest.TestCase):
    def job(self, **overrides):
        return {
            "id": "job", "kind": "contract_review", "status": "failed",
            "progress_step": "provider-secret", "attempts": 2,
            "error_code": "RuntimeError", "error_message": "provider-secret",
            "created_at": utcnow().isoformat(), "started_at": None,
            "completed_at": None, **overrides,
        }

    def test_legacy_categories_and_raw_provider_json(self):
        cases = [
            ("SourceRetentionExpired", "timeout", "source_retention_expired"),
            ("SourceUnavailable", "timeout", "source_unavailable"),
            ("WorkerLeaseExpired", "timeout", "review_interrupted"),
            ("AuthenticationError", "provider-secret", "review_service_unavailable"),
            ("RateLimitError", "provider-secret", "review_service_busy"),
            ("APITimeoutError", "provider-secret", "review_timeout"),
            ("PdfReadError", "provider-secret", "document_parse_failed"),
            ("ValueError", "No readable text was found in the document.", "document_parse_failed"),
            ("ValueError", "GROQ_API_KEY is missing.", "review_service_unavailable"),
            ("RuntimeError", '{"error":{"code":"model_not_found","message":"provider-secret"}}', "review_service_unavailable"),
            ("RuntimeError", {"error": {"code": "rate_limit", "request": "provider-secret"}}, "review_service_busy"),
            ("APIStatusError", 'Error code: 429 - {"request":"provider-secret"}', "review_service_busy"),
            ("untrusted-code", {"error": {"request": "provider-secret"}}, "review_failed"),
            ("untrusted-code", "arbitrary diagnostics", "review_failed"),
            ("RuntimeError", "The source retention deadline has elapsed.", "source_retention_expired"),
            ("RuntimeError", "The source document is no longer available.", "source_unavailable"),
        ]
        for code, message, expected in cases:
            with self.subTest(code=code, message=message):
                raw = self.job(error_code=code, error_message=message)
                original = copy.deepcopy(raw)
                result = JobResponse.model_validate_json(json.dumps(raw)).model_dump()
                self.assertEqual(result["error_code"], expected)
                self.assertEqual(result["error_message"], PUBLIC_MESSAGES[expected])
                self.assertNotIn("provider-secret", json.dumps(result, default=str))
                self.assertEqual(raw, original)
        self.assertNotIn("retry", PUBLIC_MESSAGES["review_service_unavailable"].lower())

    def test_stable_codes_always_replace_messages(self):
        for code, message in PUBLIC_MESSAGES.items():
            result = JobResponse(**self.job(error_code=code))
            self.assertEqual((result.error_code, result.error_message), (code, message))

    def test_every_status_projects_all_diagnostics_and_progress(self):
        for status in ("queued", "running", "processing", "ready", "succeeded", "cancelled", "unknown", "failed"):
            with self.subTest(status=status):
                result = JobResponse(**self.job(status=status, error_code={"secret": 1}, error_message=["secret"], progress_step={"secret": 1}))
                self.assertNotIn("secret", result.model_dump_json())
                self.assertEqual(result.error_code, "review_failed" if status == "failed" else "")
                if status != "failed":
                    self.assertEqual(result.error_message, "")
        for progress in PROCESSING_PROGRESS:
            self.assertEqual(JobResponse(**self.job(status="running", progress_step=progress)).progress_step, progress)
            self.assertEqual(JobResponse(**self.job(status="queued", progress_step=progress)).progress_step, "Waiting for a review worker")

    def test_all_audit_schemas_share_fail_closed_projection(self):
        job_id = "44d9cc80-26e0-4ee1-8fbe-f8d2a52c986d"
        base = dict(id="audit", actor_user_id=None, actor_name="System", contract_id=None,
                    contract_title=None, created_at=utcnow().isoformat())
        for schema in (ContractActivityResponse, AuditEventResponse, ReportActivityItem):
            for action in ("review.failed", "contract.review_failed"):
                for code in ("SourceRetentionExpired", "SourceUnavailable", "untrusted-code"):
                    detail = {"job_id": job_id, "error_code": code, "error": {"payload": "provider-secret"}, "unknown": "provider-secret"}
                    original = copy.deepcopy(detail)
                    result = schema.model_validate_json(json.dumps({**base, "action": action, "detail": detail}))
                    expected = {"SourceRetentionExpired": "source_retention_expired", "SourceUnavailable": "source_unavailable"}.get(code, "review_failed")
                    self.assertEqual(result.detail, {"job_id": job_id, "error_code": expected})
                    self.assertEqual(detail, original)
                for detail in ({"job_id": "provider-secret"}, {"job_id": {"nested": "provider-secret"}}, [], None):
                    result = schema(**base, action=action, detail=detail)
                    self.assertEqual(result.detail, {"error_code": "review_failed"})
            detail = {"nested": {"unchanged": True}, "job_id": "not-a-uuid"}
            self.assertEqual(schema(**base, action="contract.updated", detail=detail).detail, detail)
