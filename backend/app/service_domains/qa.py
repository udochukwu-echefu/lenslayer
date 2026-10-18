"""Authorized SQL candidate retrieval, shared by JSON and interactive Q&A."""
import hashlib

from fastapi import HTTPException
from sqlalchemy import and_, case, func, or_, select

from ..document_intelligence import PortfolioDocument
from ..document_intelligence.adapters import _question_tokens
from ..models import Contract, ContractReview, utcnow
from ..source_retention import require_source_available
from .common import json_load

PORTFOLIO_CANDIDATES = 24


def effective_text():
    available = and_(Contract.retain_source_text.is_(True),
                     or_(Contract.expires_at.is_(None), Contract.expires_at > utcnow()),
                     ContractReview.source_text.is_not(None), ContractReview.source_text != "")
    return case((available, ContractReview.source_text), else_=ContractReview.analysis_json), available


def portfolio_documents(service, organization_id, user, question):
    service.workspace.membership(organization_id, user)
    text, available = effective_text()
    # Bound tokens as well as candidate count; SQL searches the full authorized
    # collection, not a newest-N window. LIKE metacharacters are escaped.
    tokens = sorted(_question_tokens(question))[:16]
    score = sum((case((func.lower(Contract.title).contains(token, autoescape=True), 4), else_=0)
                 + case((func.lower(text).contains(token, autoescape=True), 1), else_=0)
                 for token in tokens), start=0)
    if not tokens:
        return []
    ids = list(service.session.scalars(
        select(Contract.id).join(ContractReview, ContractReview.contract_id == Contract.id)
        .where(Contract.organization_id == organization_id,
               ContractReview.organization_id == organization_id, score > 0)
        .order_by(score.desc(), Contract.id).limit(PORTFOLIO_CANDIDATES)))
    if not ids:
        return []
    rows = service.session.execute(
        select(Contract.id, Contract.title, text.label("evidence"), available.label("retained"), ContractReview.id)
        .join(ContractReview, ContractReview.contract_id == Contract.id)
        .where(Contract.organization_id == organization_id, ContractReview.organization_id == organization_id,
               Contract.id.in_(ids))).all()
    by_id = {row[0]: row for row in rows}
    return [PortfolioDocument(row[0], row[1], row[2] or "",
                             f"{'Retained source' if row[3] else 'Structured review'} {row[4]}")
            for id in ids if (row := by_id.get(id)) is not None]


def contract_input(service, organization_id, contract_id, user):
    contract = service.contracts.get_contract(organization_id, contract_id, user)
    require_source_available(contract)
    review = service.contracts.get_review(organization_id, contract_id, user)
    if not contract.retain_source_text or not (review.source_text or "").strip():
        raise HTTPException(status_code=409, detail="Contract Q&A requires retained source text.")
    return review.source_text, json_load(contract.review_context_json, {})


def fingerprint(documents):
    # Used in memory only, never persisted/logged. Detect deletion, expiry or
    # replacement while generation was outside a transaction.
    return {d.contract_id: (d.title, d.evidence_kind, hashlib.sha256(d.text.encode()).hexdigest()) for d in documents}


def revalidate_portfolio(service, organization_id, snapshot):
    """Exact prepared records only: no ranking, ORM reports or source transfer.

    Hash current content in the database, detecting in-place edits without an
    assumed immutable version/timestamp. SHA-256 is built into PostgreSQL; local
    SQLite connections register the equivalent deterministic function.
    """
    if not snapshot:
        return {}
    if len(snapshot) > PORTFOLIO_CANDIDATES:
        raise ValueError("Evidence snapshot exceeds candidate bound")
    text, available = effective_text()
    digest = (func.encode(func.sha256(func.convert_to(text, "UTF8")), "hex")
              if service.session.bind.dialect.name == "postgresql" else func.ll_sha256(text))
    rows = service.session.execute(select(Contract.id, Contract.title, ContractReview.id, available, digest)
        .join(ContractReview, ContractReview.contract_id == Contract.id)
        .where(Contract.organization_id == organization_id, ContractReview.organization_id == organization_id,
               Contract.id.in_(snapshot))).all()
    return {id: (title, f"{'Retained source' if retained else 'Structured review'} {review}", value)
            for id, title, review, retained, value in rows}
