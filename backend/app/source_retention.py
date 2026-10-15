"""Source-only retention; durable per-asset deletion intent, no ledger deletion."""
from datetime import timezone
import logging

from fastapi import HTTPException
from sqlalchemy import select, update

from .models import Contract, ContractReview, ContractVersion, DocumentAsset, IntegrationImport, PlatformAuditEvent, ProcessingJob, utcnow

logger = logging.getLogger(__name__)


def source_expired(contract) -> bool:
    deadline = contract.expires_at
    return deadline is not None and (deadline.replace(tzinfo=timezone.utc) if deadline.tzinfo is None else deadline) <= utcnow()


def require_source_available(contract) -> None:
    if source_expired(contract):
        raise HTTPException(status_code=409, detail="The source retention deadline has elapsed.")


def serialize_sqlite_maintenance(session, database) -> None:
    # SQLite has no FOR UPDATE. Reserve its writer before reading candidates.
    if database.engine.dialect.name == "sqlite":
        session.connection().exec_driver_sql("BEGIN IMMEDIATE")


def delete_pending_sources(database, object_store, *, asset_ids=None) -> int:
    """Retry each durable intent at most once per invocation, without a poll loop.

    A row lock spans the idempotent object delete and acknowledgement. Concurrent
    PostgreSQL workers skip it; SQLite serializes writers. Failure/crash preserves
    purge_pending. A crash after object deletion can repeat DELETE (never a write
    or provider/business action), so adapters must treat absence as success.
    """
    with database.session_factory() as session:
        query = select(DocumentAsset.id).where(DocumentAsset.status == "purge_pending")
        if asset_ids is not None:
            query = query.where(DocumentAsset.id.in_(asset_ids))
        candidates = list(session.scalars(query.order_by(DocumentAsset.id)))
    deleted = 0
    for asset_id in candidates:
        with database.session_factory() as session:
            serialize_sqlite_maintenance(session, database)
            query = select(DocumentAsset).where(DocumentAsset.id == asset_id, DocumentAsset.status == "purge_pending")
            if database.engine.dialect.name == "postgresql":
                query = query.with_for_update(skip_locked=True)
            asset = session.scalar(query)
            if asset is None:
                continue
            try:
                object_store.delete(asset.storage_key)
            except Exception:
                # Never emit keys, source text, request/response or exception data.
                logger.warning("Source object deletion deferred; durable retry remains pending.")
            else:
                asset.status = "purged"
                deleted += 1
            session.commit()
    return deleted


def purge_expired_sources(database, object_store) -> int:
    """Erase source, not the contract/review/version/task/audit/agent records."""
    with database.session_factory() as session:
        serialize_sqlite_maintenance(session, database)
        query = select(Contract).where(Contract.expires_at.is_not(None), Contract.expires_at <= utcnow()).order_by(Contract.id)
        if database.engine.dialect.name == "postgresql":
            query = query.with_for_update(skip_locked=True)
        for contract in session.scalars(query):
            session.execute(update(ContractReview).where(ContractReview.contract_id == contract.id,
                ContractReview.source_text.is_not(None)).values(source_text=None))
            session.execute(update(ContractVersion).where(ContractVersion.contract_id == contract.id,
                ContractVersion.extracted_text.is_not(None)).values(extracted_text=None))
            session.execute(update(DocumentAsset).where(DocumentAsset.contract_id == contract.id,
                DocumentAsset.status != "purged").values(status="purge_pending"))
            # Fence an expired upload/review, including a worker already analyzing
            # out of transaction. Its final status/claim/deadline check cannot save.
            session.execute(update(ProcessingJob).where(ProcessingJob.contract_id == contract.id,
                ProcessingJob.status.in_(["queued", "running"])).values(status="failed",
                    progress_step="Source retention expired", error_code="SourceRetentionExpired",
                    error_message="The source retention deadline has elapsed.", completed_at=utcnow()))
            if contract.status == "processing":
                contract.status = "failed"
                session.execute(update(IntegrationImport).where(IntegrationImport.contract_id == contract.id).values(
                    status="failed", error_message="The source retention deadline has elapsed."))
            exists = session.scalar(select(PlatformAuditEvent.id).where(PlatformAuditEvent.contract_id == contract.id,
                PlatformAuditEvent.action == "contract.source_purged").limit(1))
            if exists is None:
                session.add(PlatformAuditEvent(organization_id=contract.organization_id, actor_user_id=None,
                    contract_id=contract.id, action="contract.source_purged", detail_json="{}"))
            # Keep expires_at as the irreversible read/write fence. Do not extend
            # retention or erase approval/evidence/receipt/graph records.
        session.commit()
    return delete_pending_sources(database, object_store)
