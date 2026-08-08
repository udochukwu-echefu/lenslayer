"""Structured review playbooks and deterministic deviation mapping."""

from __future__ import annotations

import hashlib
import re
from typing import Any


DEFAULT_PLAYBOOK = {
    "name": "Balanced commercial review",
    "description": "A starting position for common commercial agreements. Adapt owners and positions before production use.",
    "contract_types": ["Services", "SaaS", "Supplier", "Consulting", "Lease"],
    "is_default": True,
    "rules": [
        {
            "id": "termination",
            "title": "Termination and renewal",
            "keywords": ["termination", "terminate", "renewal", "auto-renew"],
            "required": True,
            "preferred_position": "Mutual termination rights, clear cure periods, and advance renewal notice.",
            "fallback_position": "A practical exit right with defined notice and no disproportionate exit fee.",
            "escalation_trigger": "One-sided termination, automatic renewal without notice, or immediate termination for minor breach.",
            "owner": "Legal",
        },
        {
            "id": "liability",
            "title": "Liability cap",
            "keywords": ["liability", "indemnity", "indemnification", "consequential damages"],
            "required": True,
            "preferred_position": "A mutual, commercially proportionate liability cap with narrow, explicit carve-outs.",
            "fallback_position": "Cap ordinary claims and escalate uncapped or asymmetric exposure.",
            "escalation_trigger": "Unlimited liability, broad indemnity, or uncapped indirect damages exposure.",
            "owner": "Legal / Finance",
        },
        {
            "id": "payment",
            "title": "Payment and price changes",
            "keywords": ["payment", "invoice", "fee", "price", "late fee"],
            "required": True,
            "preferred_position": "Clear fees, invoice timing, dispute rights, and notice before price changes.",
            "fallback_position": "Defined payment dates and a reasonable dispute/cure process.",
            "escalation_trigger": "Unilateral price changes, acceleration, or disproportionate late charges.",
            "owner": "Finance",
        },
        {
            "id": "data",
            "title": "Confidentiality and data use",
            "keywords": ["confidential", "personal data", "privacy", "data protection", "security"],
            "required": True,
            "preferred_position": "Purpose-limited data use, appropriate safeguards, incident notice, and return/deletion duties.",
            "fallback_position": "Written security commitments and no unrelated use of confidential or personal data.",
            "escalation_trigger": "Broad data reuse, missing security duties, or no breach notification commitment.",
            "owner": "Security / Legal",
        },
        {
            "id": "ip",
            "title": "Intellectual property",
            "keywords": ["intellectual property", "copyright", "license", "work product", "ownership"],
            "required": True,
            "preferred_position": "Each party keeps background IP; deliverable ownership and licence scope are explicit.",
            "fallback_position": "A licence limited to the agreed purpose, users, territory, and term.",
            "escalation_trigger": "Assignment of background IP or an unrestricted perpetual licence beyond the deal purpose.",
            "owner": "Legal / Product",
        },
    ],
}


def ensure_default_playbook(store: Any, owner_id: str) -> dict[str, Any]:
    playbooks = store.list_playbooks(owner_id)
    if playbooks:
        return next((item for item in playbooks if item.get("is_default")), playbooks[0])
    playbook_id = store.save_playbook(owner_id, DEFAULT_PLAYBOOK)
    return store.get_playbook(owner_id, playbook_id)


def finding_key(finding: dict[str, Any], index: int = 0) -> str:
    raw = "|".join(
        str(finding.get(key) or "")
        for key in ("title", "issue", "citation", "quote", "clause")
    )
    return hashlib.sha256(f"{index}|{raw}".encode("utf-8")).hexdigest()[:24]


def _search_text(finding: dict[str, Any]) -> str:
    return " ".join(str(value or "") for value in finding.values()).lower()


def _keyword_score(text: str, keywords: list[str]) -> int:
    return sum(1 for keyword in keywords if re.search(rf"\b{re.escape(keyword.lower())}\b", text))


def evaluate_report(report: dict[str, Any], playbook: dict[str, Any] | None) -> dict[str, Any]:
    if not playbook:
        return {"playbook_name": "No playbook", "deviations": [], "summary": {}}
    findings: list[tuple[str, dict[str, Any]]] = []
    findings.extend(("risk", item) for item in report.get("risk_assessment", []))
    findings.extend(("possible_gap", item) for item in report.get("missing_protections", []))
    deviations = []
    for rule in playbook.get("rules", []):
        keywords = [str(item).lower() for item in rule.get("keywords", []) if item]
        ranked = sorted(
            (
                (_keyword_score(_search_text(finding), keywords), finding_type, finding)
                for finding_type, finding in findings
            ),
            key=lambda item: item[0],
            reverse=True,
        )
        score, finding_type, finding = ranked[0] if ranked else (0, "", {})
        if score == 0:
            finding_type, finding = "", {}
            status = "Not detected" if rule.get("required") else "Not applicable"
            attention = "Medium" if rule.get("required") else "Low"
        elif finding_type == "possible_gap" or str(finding.get("risk_level", "")).lower() == "high":
            status = "Escalate"
            attention = "High"
        elif str(finding.get("risk_level", "")).lower() == "medium":
            status = "Review"
            attention = "Medium"
        else:
            status = "Within guardrail"
            attention = "Low"
        deviations.append(
            {
                "rule_id": rule.get("id"),
                "title": rule.get("title"),
                "status": status,
                "attention": attention,
                "preferred_position": rule.get("preferred_position"),
                "fallback_position": rule.get("fallback_position"),
                "escalation_trigger": rule.get("escalation_trigger"),
                "owner": rule.get("owner"),
                "matched_finding": finding.get("title") or finding.get("issue") or "",
                "citation": finding.get("citation") or "",
                "quote": finding.get("quote") or "",
            }
        )
    summary = {
        "escalate": sum(item["status"] == "Escalate" for item in deviations),
        "review": sum(item["status"] in {"Review", "Not detected"} for item in deviations),
        "within_guardrail": sum(item["status"] == "Within guardrail" for item in deviations),
    }
    return {"playbook_id": playbook.get("id"), "playbook_name": playbook.get("name"), "deviations": deviations, "summary": summary}
