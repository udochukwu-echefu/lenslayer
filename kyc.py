import json
import re
from copy import deepcopy
from datetime import date, datetime
from difflib import SequenceMatcher


REQUIRED_DOCUMENTS = {"government_id", "proof_of_address", "bank_statement", "selfie"}


SAMPLE_CASES = [
    {
        "id": "KYC-2026-001",
        "applicant": "Adaeze Nwosu",
        "submitted_at": "2026-07-12T09:14:00",
        "application": {
            "full_name": "Adaeze Chiamaka Nwosu",
            "date_of_birth": "1993-04-18",
            "address": "14 Admiralty Way, Lekki Phase 1, Lagos",
            "id_number": "A09277164",
        },
        "documents": [
            {
                "type": "government_id",
                "label": "Nigerian passport",
                "reference": "Passport · Bio page",
                "confidence": 0.97,
                "fields": {
                    "full_name": "Adaeze Chiamaka Nwosu",
                    "date_of_birth": "1993-04-18",
                    "id_number": "A09277164",
                    "expiry_date": "2025-12-02",
                },
            },
            {
                "type": "proof_of_address",
                "label": "Electricity bill",
                "reference": "EKEDC bill · Customer details",
                "confidence": 0.94,
                "fields": {
                    "full_name": "Adaeze C. Nwosu",
                    "address": "8 Fola Osibo Street, Lekki Phase 1, Lagos",
                },
            },
            {
                "type": "bank_statement",
                "label": "Bank statement",
                "reference": "Statement · Account holder block",
                "confidence": 0.96,
                "fields": {
                    "full_name": "Adaeze Chiamaka Nwosu",
                    "address": "14 Admiralty Way, Lekki Phase 1, Lagos",
                },
            },
            {
                "type": "selfie",
                "label": "Selfie with passport",
                "reference": "Selfie capture · Frame 1",
                "confidence": 0.91,
                "fields": {"face_match": "match", "liveness": "not_tested"},
            },
        ],
    },
    {
        "id": "KYC-2026-002",
        "applicant": "Tunde Balogun",
        "submitted_at": "2026-07-12T10:32:00",
        "application": {
            "full_name": "Tunde Olumide Balogun",
            "date_of_birth": "1988-09-07",
            "address": "22 Allen Avenue, Ikeja, Lagos",
            "id_number": "B18439201",
        },
        "documents": [
            {
                "type": "government_id",
                "label": "Nigerian passport",
                "reference": "Passport · Bio page",
                "confidence": 0.98,
                "fields": {
                    "full_name": "Tunde Olumide Balogun",
                    "date_of_birth": "1988-09-07",
                    "id_number": "B18439201",
                    "expiry_date": "2030-03-11",
                },
            },
            {
                "type": "proof_of_address",
                "label": "Water bill",
                "reference": "LWC bill · Service address",
                "confidence": 0.93,
                "fields": {
                    "full_name": "Tunde O. Balogun",
                    "address": "22 Allen Ave, Ikeja, Lagos",
                },
            },
            {
                "type": "bank_statement",
                "label": "Bank statement",
                "reference": "Statement · Customer details",
                "confidence": 0.97,
                "fields": {
                    "full_name": "Tunde Olumide Balogun",
                    "address": "22 Allen Avenue, Ikeja, Lagos",
                },
            },
            {
                "type": "selfie",
                "label": "Selfie with passport",
                "reference": "Selfie capture · Frame 1",
                "confidence": 0.95,
                "fields": {"face_match": "match", "liveness": "not_tested"},
            },
        ],
    },
    {
        "id": "KYC-2026-003",
        "applicant": "Mariam Yusuf",
        "submitted_at": "2026-07-12T11:08:00",
        "application": {
            "full_name": "Mariam Yusuf",
            "date_of_birth": "1996-02-21",
            "address": "5 Bompai Road, Kano",
            "id_number": "C83017452",
        },
        "documents": [
            {
                "type": "government_id",
                "label": "National identity card",
                "reference": "Identity card · Front",
                "confidence": 0.89,
                "fields": {
                    "full_name": "Maryam Musa Yusuf",
                    "date_of_birth": "1994-02-21",
                    "id_number": "C83017452",
                    "expiry_date": "2029-08-19",
                },
            },
            {
                "type": "proof_of_address",
                "label": "Electricity bill",
                "reference": "KEDCO bill · Service address",
                "confidence": 0.82,
                "fields": {
                    "full_name": "Musa Yusuf",
                    "address": "17 Zoo Road, Kano",
                },
            },
            {
                "type": "bank_statement",
                "label": "Bank statement",
                "reference": "Statement · Account holder block",
                "confidence": 0.92,
                "fields": {
                    "full_name": "Mariam Yusuf",
                    "address": "5 Bompai Road, Kano",
                },
            },
            {
                "type": "selfie",
                "label": "Selfie with identity card",
                "reference": "Selfie capture · Frame 1",
                "confidence": 0.78,
                "fields": {"face_match": "possible_mismatch", "liveness": "not_tested"},
            },
        ],
    },
]


def normalize_text(value):
    return " ".join(re.sub(r"[^a-z0-9 ]+", " ", str(value or "").lower()).split())


def normalize_address(value):
    normalized = normalize_text(value)
    replacements = {" avenue ": " ave ", " street ": " st ", " road ": " rd "}
    padded = f" {normalized} "
    for source, target in replacements.items():
        padded = padded.replace(source, target)
    return " ".join(padded.split())


def similarity(left, right, *, address=False):
    normalizer = normalize_address if address else normalize_text
    return SequenceMatcher(None, normalizer(left), normalizer(right)).ratio()


def name_similarity(left, right):
    left_tokens = normalize_text(left).split()
    right_tokens = normalize_text(right).split()
    if len(left_tokens) >= 2 and len(right_tokens) >= 2:
        same_first = left_tokens[0] == right_tokens[0]
        same_last = left_tokens[-1] == right_tokens[-1]
        if same_first and same_last:
            return max(0.92, similarity(left, right))
    return similarity(left, right)


def get_cases():
    return deepcopy(SAMPLE_CASES)


def get_case(case_id):
    return next((case for case in get_cases() if case["id"] == case_id), None)


def _evidence(document, field):
    return {
        "document": document["label"],
        "reference": document["reference"],
        "field": field,
        "value": document["fields"].get(field, "Not present"),
        "confidence": document["confidence"],
    }


def _finding(code, title, severity, points, explanation, action, evidence):
    return {
        "code": code,
        "title": title,
        "severity": severity,
        "points": points,
        "explanation": explanation,
        "action": action,
        "evidence": evidence,
    }


def evaluate_case(case, today=None):
    today = today or date.today()
    application = case["application"]
    documents = case["documents"]
    findings = []
    present_types = {document["type"] for document in documents}

    for missing_type in sorted(REQUIRED_DOCUMENTS - present_types):
        findings.append(
            _finding(
                "missing_document",
                f"Missing {missing_type.replace('_', ' ')}",
                "High",
                20,
                "A required onboarding document was not supplied.",
                "Request the missing document before a decision is made.",
                [{"document": "Application", "reference": "Required document checklist", "field": "document", "value": missing_type, "confidence": 1.0}],
            )
        )

    for document in documents:
        fields = document["fields"]
        if "full_name" in fields:
            score = name_similarity(application["full_name"], fields["full_name"])
            if score < 0.82:
                findings.append(
                    _finding(
                        "name_mismatch",
                        "Material name mismatch",
                        "High",
                        25,
                        "The extracted name differs materially from the submitted application.",
                        "Confirm the applicant's legal name and request supporting evidence for any name change.",
                        [
                            {"document": "Application form", "reference": "Identity details", "field": "full_name", "value": application["full_name"], "confidence": 1.0},
                            _evidence(document, "full_name"),
                        ],
                    )
                )
            elif score < 0.94:
                findings.append(
                    _finding(
                        "name_variation",
                        "Name variation",
                        "Low",
                        5,
                        "The documents appear to use an abbreviation, alternate spelling, or omitted middle name.",
                        "Confirm that the variation is expected and record the accepted legal name.",
                        [
                            {"document": "Application form", "reference": "Identity details", "field": "full_name", "value": application["full_name"], "confidence": 1.0},
                            _evidence(document, "full_name"),
                        ],
                    )
                )

        if fields.get("date_of_birth") and fields["date_of_birth"] != application["date_of_birth"]:
            findings.append(
                _finding(
                    "dob_mismatch",
                    "Date of birth mismatch",
                    "High",
                    40,
                    "The date of birth on identity evidence does not match the application.",
                    "Escalate for identity verification and do not rely on automated approval.",
                    [
                        {"document": "Application form", "reference": "Identity details", "field": "date_of_birth", "value": application["date_of_birth"], "confidence": 1.0},
                        _evidence(document, "date_of_birth"),
                    ],
                )
            )

        if fields.get("address"):
            score = similarity(application["address"], fields["address"], address=True)
            if score < 0.76:
                findings.append(
                    _finding(
                        "address_mismatch",
                        "Address mismatch",
                        "Medium",
                        15,
                        "The address on this document does not reconcile with the application address.",
                        "Ask for a current proof of address or document the reason for the difference.",
                        [
                            {"document": "Application form", "reference": "Contact details", "field": "address", "value": application["address"], "confidence": 1.0},
                            _evidence(document, "address"),
                        ],
                    )
                )

        if fields.get("expiry_date"):
            expiry = datetime.strptime(fields["expiry_date"], "%Y-%m-%d").date()
            if expiry < today:
                findings.append(
                    _finding(
                        "expired_id",
                        "Expired identity document",
                        "High",
                        35,
                        f"The identity document expired on {expiry.isoformat()}.",
                        "Request an unexpired identity document before approval.",
                        [_evidence(document, "expiry_date")],
                    )
                )

        if document["confidence"] < 0.85:
            findings.append(
                _finding(
                    "low_extraction_confidence",
                    "Extraction needs verification",
                    "Medium",
                    10,
                    "At least one document was extracted below the configured confidence threshold.",
                    "Compare the extracted fields with the source image before relying on them.",
                    [{"document": document["label"], "reference": document["reference"], "field": "extraction_confidence", "value": f"{document['confidence']:.0%}", "confidence": document["confidence"]}],
                )
            )

        if fields.get("face_match") == "possible_mismatch":
            findings.append(
                _finding(
                    "face_mismatch",
                    "Possible selfie mismatch",
                    "High",
                    45,
                    "The simulated face comparison did not confidently link the selfie to the identity document.",
                    "Route to trained manual review or an approved identity verification provider.",
                    [_evidence(document, "face_match")],
                )
            )

    deduplicated = []
    seen = set()
    for finding in findings:
        evidence_key = tuple((item["document"], item["field"], str(item["value"])) for item in finding["evidence"])
        key = (finding["code"], evidence_key)
        if key not in seen:
            seen.add(key)
            deduplicated.append(finding)
    findings = sorted(deduplicated, key=lambda item: ({"High": 0, "Medium": 1, "Low": 2}[item["severity"]], -item["points"]))

    points_by_rule = {}
    for finding in findings:
        points_by_rule[finding["code"]] = max(points_by_rule.get(finding["code"], 0), finding["points"])
    score = min(100, sum(points_by_rule.values()))
    if score >= 70:
        suggestion = "Reject"
        reasoning = "Material identity conflicts require new evidence or enhanced verification before onboarding."
    elif score >= 20:
        suggestion = "Escalate"
        reasoning = "One or more discrepancies need a reviewer to resolve before approval."
    else:
        suggestion = "Approve"
        reasoning = "Only low-impact variations were detected in the supplied synthetic evidence."

    average_confidence = sum(document["confidence"] for document in documents) / len(documents) if documents else 0
    high_count = sum(1 for item in findings if item["severity"] == "High")
    summary = (
        f"{case['applicant']} has a reconciliation score of {score}/100 with "
        f"{len(findings)} flagged issue{'s' if len(findings) != 1 else ''}. "
        f"{high_count} require{'s' if high_count == 1 else ''} high-priority attention. "
        f"Suggested action: {suggestion.lower()}."
    )

    field_matrix = []
    for field in ("full_name", "date_of_birth", "address", "id_number"):
        row = {"Field": field.replace("_", " ").title(), "Application": application.get(field, "Not supplied")}
        for document in documents:
            row[document["label"]] = document["fields"].get(field, "Not present")
        field_matrix.append(row)

    return {
        "case_id": case["id"],
        "applicant": case["applicant"],
        "score": score,
        "suggested_action": suggestion,
        "reasoning": reasoning,
        "summary": summary,
        "findings": findings,
        "document_count": len(documents),
        "required_document_count": len(REQUIRED_DOCUMENTS),
        "average_confidence": average_confidence,
        "field_matrix": field_matrix,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "synthetic": True,
    }


def export_case(case, evaluation, decisions=None):
    payload = {
        "case": case,
        "evaluation": evaluation,
        "decision_history": decisions or [],
        "notice": "Synthetic demonstration data. Not a production KYC determination.",
    }
    return json.dumps(payload, indent=2, ensure_ascii=False)
