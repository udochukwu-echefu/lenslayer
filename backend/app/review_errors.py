"""Pure, fail-closed public projections of stored review diagnostics.

Historical diagnostics are untrusted. Never return their text (including nested
provider responses), and never write the projection back to persistence.
"""
from __future__ import annotations

import json
import re
from typing import Any
from uuid import UUID


PUBLIC_MESSAGES = {
    "review_service_unavailable": "The document analysis service is unavailable. Please contact support.",
    "review_service_busy": "The document analysis service is busy. Please try again later.",
    "review_timeout": "The review timed out while analysing the document.",
    "source_retention_expired": "The source retention deadline has elapsed.",
    "source_unavailable": "The source document is no longer available.",
    "review_interrupted": "The review was interrupted before it could be completed.",
    "document_parse_failed": "The source document could not be read.",
    "review_failed": "The review could not be completed. Please contact support.",
}

_LEGACY_CODES = {
    "SourceRetentionExpired": "source_retention_expired",
    "SourceUnavailable": "source_unavailable",
    "WorkerLeaseExpired": "review_interrupted",
    "AuthenticationError": "review_service_unavailable",
    "PermissionDeniedError": "review_service_unavailable",
    "NotFoundError": "review_service_unavailable",
    "APIConnectionError": "review_service_unavailable",
    "ServiceUnavailableError": "review_service_unavailable",
    "InternalServerError": "review_service_unavailable",
    "RateLimitError": "review_service_busy",
    "TimeoutError": "review_timeout",
    "APITimeoutError": "review_timeout",
    "ReadTimeout": "review_timeout",
    "ConnectTimeout": "review_timeout",
    "DocumentParseError": "document_parse_failed",
    "PdfReadError": "document_parse_failed",
    "PDFSyntaxError": "document_parse_failed",
    "EmptyFileError": "document_parse_failed",
    "FileDataError": "document_parse_failed",
    "PackageNotFoundError": "document_parse_failed",
    "UnicodeDecodeError": "document_parse_failed",
}

PROCESSING_PROGRESS = frozenset({
    "Extracting document text",
    "Analysing clauses and obligations",
})


def public_error_code(code: Any, message: Any = "") -> str:
    """Recognize historical categories, never treating diagnostics as public copy."""
    if isinstance(code, str):
        if code in PUBLIC_MESSAGES:
            return code
        if code in _LEGACY_CODES:
            return _LEGACY_CODES[code]
    if isinstance(message, (dict, list)):
        message = json.dumps(message)
    text = message.lower() if isinstance(message, str) else ""
    # Keep source loss distinct from retention expiry; don't infer either from
    # generic storage/provider failures or arbitrary occurrences of 'expired'.
    if text.strip() == "the source retention deadline has elapsed.":
        return "source_retention_expired"
    if text.strip() == "the source document is no longer available.":
        return "source_unavailable"
    if any(part in text for part in (
        "model_not_found", "invalid_api_key", "authenticationerror",
        "permissiondeniederror", "api key is missing", "api_key is missing",
        "api key is invalid", "invalid api key", "incorrect api key",
        "service is temporarily unavailable",
    )) or ("model" in text and "does not exist" in text):
        return "review_service_unavailable"
    if any(part in text for part in ("rate_limit", "rate limit", "ratelimiterror", "service is busy")) or re.search(r"\b429\b", text):
        return "review_service_busy"
    if "timeout" in text or "timed out" in text:
        return "review_timeout"
    if any(part in text for part in ("no readable text was found", "cannot parse document", "failed to parse document")):
        return "document_parse_failed"
    return "review_failed"


def project_job(status: str, code: Any, message: Any, progress: Any) -> dict[str, str]:
    """Project all diagnostic fields, even when a non-error row has stale data."""
    if status == "failed":
        safe_code = public_error_code(code, message)
        step = {
            "source_retention_expired": "Source retention expired",
            "source_unavailable": "Source unavailable",
        }.get(safe_code, "Review failed")
        return {"error_code": safe_code, "error_message": PUBLIC_MESSAGES[safe_code], "progress_step": step}
    step = {
        "queued": "Waiting for a review worker",
        "running": "Processing document",
        "processing": "Processing document",
        "succeeded": "Review ready",
        "ready": "Review ready",
        "cancelled": "Review cancelled",
    }.get(status, "Review pending")
    if status in {"running", "processing"} and isinstance(progress, str) and progress in PROCESSING_PROGRESS:
        step = progress
    return {"error_code": "", "error_message": "", "progress_step": step}


def project_audit_detail(action: str, detail: Any) -> Any:
    if action not in {"review.failed", "contract.review_failed"}:
        return detail
    data = detail if isinstance(detail, dict) else {}
    result = {"error_code": public_error_code(data.get("error_code"), data.get("error_message", data.get("error", "")))}
    job_id = data.get("job_id")
    if isinstance(job_id, str):
        try:
            result["job_id"] = str(UUID(job_id))
        except ValueError:
            pass
    return result
