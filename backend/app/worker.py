from __future__ import annotations

import argparse
import json
import logging
import os
import tempfile
import time
from collections.abc import Callable
from datetime import timedelta
from pathlib import Path

from sqlalchemy import and_, delete, or_, select, update

from .config import Settings, get_settings
from .agent_runtime import claim_next_agent_action, expire_agent_runs, process_agent_action
from .agent_models import AgentWorkerHeartbeat
from .agent_generalization_runtime import purge_expired_context, recover_workflow_graphs
from .agent_wake import nudge_finished_hosted_tasks, nudge_hosted_action
from .hosted_agent_runtime import claim_next_hosted_task, process_hosted_task
from .database import Database
from .document_intelligence import ReviewWorkflow, build_review_workflow
from .email_delivery import ResendEmailSender, queue_email
from .models import (
    Contract,
    ContractReview,
    ContractVersion,
    DocumentAsset,
    EmailDelivery,
    IntegrationImport,
    LifecycleItem,
    Membership,
    Notification,
    OrganizationSettings,
    PlatformAuditEvent,
    ProcessingJob,
    User,
    WebhookDelivery,
    WebhookSubscription,
    utcnow,
    new_id,
)
from .object_storage import ObjectStore, build_object_store
from .service_domains.common import json_dump, json_load
from .webhook_delivery import send_webhook
from .source_retention import (delete_pending_sources, purge_expired_sources,
                               serialize_sqlite_maintenance, source_expired)


logger = logging.getLogger(__name__)
WEBHOOK_MAX_ATTEMPTS = 5
WEBHOOK_RETRY_SECONDS = 300
DOCUMENT_RECOVERY_LIMIT = 100


def public_review_error(exc: Exception) -> str:
    """Return a stable user-facing message without leaking provider internals."""
    message = str(exc).lower()
    if "model_not_found" in message or ("model" in message and "does not exist" in message):
        return "The document analysis service is temporarily unavailable. Please retry shortly."
    if "rate_limit" in message or "rate limit" in message or "429" in message:
        return "The document analysis service is busy. Please retry shortly."
    if "timeout" in message or "timed out" in message:
        return "The review timed out while analysing the document. Please retry."
    return "The review could not be completed. Please retry or contact support."


def enqueue_notification(
    session,
    settings: Settings,
    *,
    organization_id: str,
    user_id: str,
    contract_id: str | None,
    kind: str,
    title: str,
    message: str,
    action_url: str,
) -> None:
    session.add(
        Notification(
            organization_id=organization_id,
            user_id=user_id,
            contract_id=contract_id,
            kind=kind,
            title=title,
            message=message,
            action_url=action_url,
        )
    )
    user = session.get(User, user_id)
    queue_email(
        session,
        settings,
        organization_id=organization_id,
        user_id=user_id,
        recipient=user.email if user else "",
        kind=kind,
        subject=title,
        message=message,
        action_url=action_url,
    )


def claim_next_email(database: Database, settings: Settings) -> str | None:
    if settings.email_backend.lower() == "disabled":
        return None
    with database.session_factory() as session:
        stale_before = utcnow() - timedelta(seconds=settings.email_lease_seconds)
        query = (
            select(EmailDelivery)
            .where(
                or_(
                    EmailDelivery.status == "pending",
                    and_(EmailDelivery.status == "failed", EmailDelivery.updated_at < utcnow() - timedelta(seconds=300)),
                    and_(EmailDelivery.status == "sending", EmailDelivery.updated_at < stale_before),
                ),
                EmailDelivery.attempts < settings.email_max_attempts,
            )
            .order_by(EmailDelivery.created_at.asc())
            .limit(1)
        )
        if database.engine.dialect.name == "postgresql":
            query = query.with_for_update(skip_locked=True)
        delivery = session.scalar(query)
        if delivery is None:
            return None
        delivery.status = "sending"
        delivery.attempts += 1
        session.commit()
        return delivery.id


def process_email(database: Database, settings: Settings, delivery_id: str) -> None:
    try:
        with database.session_factory() as session:
            delivery = session.get(EmailDelivery, delivery_id)
            if delivery is None:
                return
            message_id = ResendEmailSender(settings).send(delivery)
            delivery.status = "sent"
            delivery.provider_message_id = message_id
            delivery.last_error = ""
            delivery.sent_at = utcnow()
            if delivery.kind == "invitation_created":
                delivery.text_body = delivery.html_body = delivery.action_url = ""
            session.commit()
    except Exception as exc:
        with database.session_factory() as session:
            delivery = session.get(EmailDelivery, delivery_id)
            if delivery is not None:
                delivery.status = "failed"
                delivery.last_error = "email_delivery_failed"
                session.commit()


def enqueue_webhook_deliveries(session, organization_id: str, event_type: str, contract_id: str | None, payload: dict) -> None:
    subscriptions = session.scalars(
        select(WebhookSubscription).where(
            WebhookSubscription.organization_id == organization_id,
            WebhookSubscription.status == "active",
        )
    ).all()
    for subscription in subscriptions:
        if event_type not in set(json_load(subscription.events_json, [])):
            continue
        session.add(
            WebhookDelivery(
                organization_id=organization_id,
                subscription_id=subscription.id,
                contract_id=contract_id,
                event_type=event_type,
                payload_json=json_dump({"event": event_type, "data": payload}),
                status="pending",
            )
        )


def claim_next_webhook(database: Database) -> tuple[str, int] | None:
    with database.session_factory() as session:
        retry_before = utcnow() - timedelta(seconds=WEBHOOK_RETRY_SECONDS)
        query = (select(WebhookDelivery).join(WebhookSubscription).where(
            WebhookSubscription.status == "active",
            WebhookDelivery.attempts < WEBHOOK_MAX_ATTEMPTS,
            or_(WebhookDelivery.status == "pending",
                and_(WebhookDelivery.status.in_(["failed", "sending"]), WebhookDelivery.updated_at < retry_before)),
        ).order_by(WebhookDelivery.created_at.asc()).limit(1))
        if database.engine.dialect.name == "postgresql":
            query = query.with_for_update(skip_locked=True, of=WebhookDelivery)
        delivery = session.scalar(query)
        if delivery is None:
            return None
        identifier, attempt = delivery.id, delivery.attempts + 1
        # The conditional increment also fences competing SQLite/nonlocking
        # claimers. PostgreSQL retains its existing SKIP LOCKED claim behavior.
        changed = session.execute(update(WebhookDelivery).where(
            WebhookDelivery.id == identifier,
            WebhookDelivery.status == delivery.status,
            WebhookDelivery.attempts == delivery.attempts,
        ).values(status="sending", attempts=attempt, updated_at=utcnow())
            .execution_options(synchronize_session=False)).rowcount
        session.commit()
        return (identifier, attempt) if changed == 1 else None


def process_webhook(database: Database, delivery_id: str, claimed_attempt: int) -> None:
    if type(claimed_attempt) is not int or not 1 <= claimed_attempt <= WEBHOOK_MAX_ATTEMPTS:
        return
    with database.session_factory() as session:
        delivery = session.get(WebhookDelivery, delivery_id)
        if delivery is None or delivery.status != "sending" or delivery.attempts != claimed_attempt:
            return
        subscription = delivery.subscription
        subscription_id = subscription.id
        outbound = None
        if subscription.status != "active":
            result = {"status": "cancelled", "last_error": "webhook_revoked"}
        elif not subscription.signing_secret:
            result = {"status": "failed", "last_error": "webhook_signing_secret_missing"}
        else:
            outbound = (subscription.target_url, subscription.signing_secret, delivery.event_type,
                        delivery.id, delivery.payload_json.encode("utf-8"))
    # No transaction or mutable ORM snapshot spans the external request. This is
    # at-least-once delivery: a response loss may still require a same-ID retry.
    if outbound is not None:
        try:
            send_webhook(*outbound)
        except Exception:
            # Never persist provider response text, URLs, headers or secrets.
            result = {"status": "failed", "last_error": "webhook_delivery_failed"}
        else:
            result = {"status": "delivered", "last_error": "", "delivered_at": utcnow()}
    with database.session_factory() as session:
        changed = session.execute(update(WebhookDelivery).where(
            WebhookDelivery.id == delivery_id, WebhookDelivery.status == "sending",
            WebhookDelivery.attempts == claimed_attempt,
        ).values(**result).execution_options(synchronize_session=False)).rowcount
        if changed == 1 and result["status"] == "delivered":
            session.execute(update(WebhookSubscription).where(WebhookSubscription.id == subscription_id)
                            .values(last_delivery_at=result["delivered_at"]))
        session.commit()


def claim_next_job(database: Database, settings: Settings) -> str | None:
    with database.session_factory() as session:
        serialize_sqlite_maintenance(session, database)
        stale_before = utcnow() - timedelta(seconds=settings.worker_lease_seconds)
        query = (
            select(ProcessingJob)
            .where(
                or_(
                    ProcessingJob.status == "queued",
                    and_(ProcessingJob.status == "running", ProcessingJob.started_at < stale_before),
                ),
                ProcessingJob.attempts < settings.worker_max_attempts,
            )
            .order_by(ProcessingJob.created_at.asc())
            .limit(1)
        )
        if database.engine.dialect.name == "postgresql":
            query = query.with_for_update(skip_locked=True)
        job = session.scalar(query)
        if job is None:
            return None
        job.status = "running"
        job.progress_step = "Extracting document text"
        job.attempts += 1
        job.started_at = utcnow()
        session.commit()
        return job.id


def purge_expired_contracts(database: Database, object_store: ObjectStore) -> int:
    return purge_expired_sources(database, object_store)


def fail_contract_review(session, settings: Settings, contract: Contract, job_id: str,
                         error_code: str, public_error: str) -> None:
    """Existing review-failure effects, committed with the winning job transition."""
    contract.status = "failed"
    contract.updated_at = utcnow()
    import_record = session.scalar(select(IntegrationImport).where(IntegrationImport.contract_id == contract.id))
    if import_record is not None:
        import_record.status = "failed"
        import_record.error_message = public_error
        import_record.updated_at = utcnow()
    session.add(PlatformAuditEvent(
        organization_id=contract.organization_id, actor_user_id=None, contract_id=contract.id,
        action="review.failed", detail_json=json_dump({"job_id": job_id, "error_code": error_code}),
    ))
    enqueue_webhook_deliveries(
        session, contract.organization_id, "contract.review_failed", contract.id,
        {"contract_id": contract.id, "title": contract.title, "status": contract.status, "error_code": error_code},
    )
    preferences = session.scalar(select(OrganizationSettings).where(
        OrganizationSettings.organization_id == contract.organization_id))
    if preferences is None or preferences.notification_review_failed:
        member_ids = session.scalars(select(Membership.user_id).where(
            Membership.organization_id == contract.organization_id)).all()
        for user_id in member_ids:
            enqueue_notification(
                session, settings, organization_id=contract.organization_id, user_id=user_id,
                contract_id=contract.id, kind="review_failed", title="Contract review needs attention",
                message=f"{contract.title} could not be processed. Open it to see the error.",
                action_url=f"/contracts/{contract.id}",
            )


def recover_exhausted_document_jobs(database: Database, settings: Settings, *,
                                    limit: int = DOCUMENT_RECOVERY_LIMIT,
                                    stop_at: float | None = None) -> int:
    """Terminalize a bounded chunk of crashed final attempts, without provider work.

    Lock contracts before jobs, matching completion/retention lock order. SQLite
    reserves its writer before reading; the conditional job update additionally
    fences changed claims and atomically owns all failure effects. Later drains
    handle the remaining chunk; a live lease is never failed or retried here.
    """
    stale_before = utcnow() - timedelta(seconds=settings.worker_lease_seconds)
    eligible = (ProcessingJob.status == "running", ProcessingJob.started_at < stale_before,
                ProcessingJob.attempts >= settings.worker_max_attempts)
    with database.session_factory() as session:
        candidates = list(session.scalars(select(ProcessingJob.id).where(*eligible)
            .order_by(ProcessingJob.started_at, ProcessingJob.id).limit(max(0, min(limit, DOCUMENT_RECOVERY_LIMIT)))))
    recovered = 0
    for job_id in candidates:
        if stop_at is not None and time.monotonic() >= stop_at:
            break
        with database.session_factory() as session:
            serialize_sqlite_maintenance(session, database)
            job = session.scalar(select(ProcessingJob).where(ProcessingJob.id == job_id, *eligible))
            if job is None:
                continue
            query = select(Contract).where(Contract.id == job.contract_id)
            if database.engine.dialect.name == "postgresql":
                query = query.with_for_update(skip_locked=True)
            contract = session.scalar(query)
            if contract is None:
                # Missing/locked contracts are left for a subsequent drain.
                continue
            asset = session.get(DocumentAsset, job.document_asset_id)
            expired = source_expired(contract)
            unavailable = asset is None or asset.status != "available"
            error_code = "SourceRetentionExpired" if expired else "SourceUnavailable" if unavailable else "WorkerLeaseExpired"
            public_error = ("The source retention deadline has elapsed." if expired else
                            "The source document is no longer available." if unavailable else
                            public_review_error(TimeoutError("Review timed out")))
            changed = session.execute(update(ProcessingJob).where(
                ProcessingJob.id == job_id, *eligible, ProcessingJob.started_at == job.started_at,
                ProcessingJob.attempts == job.attempts,
            ).values(status="failed", completed_at=utcnow(), error_code=error_code, error_message=public_error,
                progress_step="Source retention expired" if expired else "Source unavailable" if unavailable else "Review failed")
                .execution_options(synchronize_session=False)).rowcount
            if changed != 1:
                continue
            if contract.status == "processing":
                if expired or unavailable:
                    # Retention/deletion intent suppresses ordinary failure effects.
                    contract.status, contract.updated_at = "failed", utcnow()
                    session.execute(update(IntegrationImport).where(IntegrationImport.contract_id == contract.id)
                        .values(status="failed", error_message=public_error, updated_at=utcnow()))
                else:
                    fail_contract_review(session, settings, contract, job_id, error_code, public_error)
            session.commit()
            recovered += 1
    return recovered


def process_lifecycle_reminders(database: Database, settings: Settings) -> int:
    now = utcnow()
    created = 0
    with database.session_factory() as session:
        serialize_sqlite_maintenance(session, database)
        query = select(LifecycleItem).where(LifecycleItem.status == "active").order_by(LifecycleItem.id)
        if database.engine.dialect.name == "postgresql":
            query = query.with_for_update(skip_locked=True)
        items = list(
            session.scalars(query).all()
        )
        for item in items:
            due_at = item.due_at if item.due_at.tzinfo else item.due_at.replace(tzinfo=now.tzinfo)
            reminder_at = due_at - timedelta(days=item.reminder_days)
            notified_today = (
                item.last_notified_at is not None
                and (item.last_notified_at if item.last_notified_at.tzinfo else item.last_notified_at.replace(tzinfo=now.tzinfo)).date() == now.date()
            )
            recipients = {item.owner_user_id} if item.owner_user_id else set(
                session.scalars(
                    select(Membership.user_id).where(
                        Membership.organization_id == item.organization_id,
                        Membership.role.in_(["owner", "admin"]),
                    )
                ).all()
            )
            if now >= reminder_at and not notified_today:
                overdue = now > due_at
                for user_id in {value for value in recipients if value}:
                    enqueue_notification(
                        session,
                        settings,
                        organization_id=item.organization_id,
                        user_id=user_id,
                        contract_id=item.contract_id,
                        kind="lifecycle_overdue" if overdue else "lifecycle_reminder",
                        title=f"{item.kind.replace('_', ' ').title()} {'overdue' if overdue else 'due soon'}",
                        message=item.title,
                        action_url=f"/calendar?item={item.id}",
                    )
                    created += 1
                item.last_notified_at = now
                session.add(
                    PlatformAuditEvent(
                        organization_id=item.organization_id,
                        actor_user_id=None,
                        contract_id=item.contract_id,
                        action="lifecycle.reminder_sent",
                        detail_json=json_dump({"lifecycle_id": item.id, "overdue": overdue}),
                    )
                )
            if now > due_at and item.escalated_at is None:
                item.escalated_at = now
                admin_ids = session.scalars(
                    select(Membership.user_id).where(
                        Membership.organization_id == item.organization_id,
                        Membership.role.in_(["owner", "admin"]),
                    )
                ).all()
                for user_id in set(admin_ids):
                    if user_id in recipients:
                        continue
                    enqueue_notification(
                        session,
                        settings,
                        organization_id=item.organization_id,
                        user_id=user_id,
                        contract_id=item.contract_id,
                        kind="lifecycle_escalated",
                        title="Overdue lifecycle item escalated",
                        message=item.title,
                        action_url=f"/calendar?item={item.id}",
                    )
                    created += 1
                session.add(
                    PlatformAuditEvent(
                        organization_id=item.organization_id,
                        actor_user_id=None,
                        contract_id=item.contract_id,
                        action="lifecycle.escalated",
                        detail_json=json_dump({"lifecycle_id": item.id, "due_at": due_at}),
                    )
                )
        session.commit()
    return created


def process_job(
    database: Database,
    object_store: ObjectStore,
    job_id: str,
    settings: Settings,
    review_workflow: ReviewWorkflow | None = None,
) -> None:
    workflow = review_workflow or build_review_workflow()
    temp_path: str | None = None
    storage_key = ""
    retain_document = True
    claimed_started_at = None
    try:
        with database.session_factory() as session:
            job = session.get(ProcessingJob, job_id)
            if job is None:
                return
            if job.status != "running":
                return
            claimed_started_at = job.started_at
            contract = session.get(Contract, job.contract_id)
            asset = session.get(DocumentAsset, job.document_asset_id)
            if contract is None or asset is None:
                raise RuntimeError("The queued job references a missing contract or document.")
            if source_expired(contract) or asset.status != "available":
                return
            storage_key = asset.storage_key
            retain_document = contract.retain_document
            data = object_store.get(storage_key)
            suffix = Path(asset.original_name).suffix.lower()

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as handle:
            handle.write(data)
            temp_path = handle.name

        extraction = workflow.extract_document(temp_path)
        full_text = extraction.text
        quality = extraction.quality

        with database.session_factory() as session:
            job = session.get(ProcessingJob, job_id)
            if job is None or job.status != "running" or job.started_at != claimed_started_at:
                return
            job.progress_step = "Analysing clauses and obligations"
            session.commit()

        with database.session_factory() as session:
            job = session.get(ProcessingJob, job_id)
            contract = session.get(Contract, job.contract_id) if job else None
            if job is None or contract is None:
                return
            if job.status != "running" or job.started_at != claimed_started_at or source_expired(contract):
                return
            context = json.loads(contract.review_context_json or "{}")

        report = workflow.analyze_contract(full_text, context)

        with database.session_factory() as session:
            serialize_sqlite_maintenance(session, database)
            job = session.get(ProcessingJob, job_id)
            contract = session.scalar(select(Contract).where(Contract.id == job.contract_id).with_for_update()) if job else None
            asset = session.get(DocumentAsset, job.document_asset_id) if job else None
            if job is None or contract is None or asset is None:
                return
            session.refresh(job)
            if (job.status != "running" or job.started_at != claimed_started_at
                    or source_expired(contract) or asset.status != "available"):
                return
            review = session.scalar(select(ContractReview).where(ContractReview.contract_id == contract.id))
            if review is None:
                review = ContractReview(organization_id=contract.organization_id, contract_id=contract.id)
                session.add(review)
            review.analysis_json = json_dump(report)
            review.quality_json = json_dump(quality)
            review.source_text = full_text if contract.retain_source_text else None
            review.updated_at = utcnow()
            initial_version = session.scalar(
                select(ContractVersion).where(
                    ContractVersion.contract_id == contract.id,
                    ContractVersion.version_number == 1,
                )
            )
            if initial_version is not None and contract.retain_source_text:
                initial_version.extracted_text = full_text
            contract.title = str(report.get("title") or contract.title)[:512]
            contract.contract_type = str(report.get("contract_type") or contract.contract_type)[:255]
            contract.status = "ready"
            contract.updated_at = utcnow()
            job.status = "succeeded"
            job.progress_step = "Review ready"
            job.completed_at = utcnow()
            if not retain_document:
                asset.status = "purge_pending"
            import_record = session.scalar(select(IntegrationImport).where(IntegrationImport.contract_id == contract.id))
            if import_record is not None:
                import_record.status = "ready"
                import_record.updated_at = utcnow()
            session.add(
                PlatformAuditEvent(
                    organization_id=contract.organization_id,
                    actor_user_id=None,
                    contract_id=contract.id,
                    action="review.completed",
                    detail_json=json_dump({"job_id": job.id, "quality": quality.get("quality")}),
                )
            )
            enqueue_webhook_deliveries(
                session,
                contract.organization_id,
                "contract.review_ready",
                contract.id,
                {"contract_id": contract.id, "title": contract.title, "status": contract.status},
            )
            preferences = session.scalar(
                select(OrganizationSettings).where(
                    OrganizationSettings.organization_id == contract.organization_id
                )
            )
            if preferences is None or preferences.notification_review_ready:
                member_ids = session.scalars(
                    select(Membership.user_id).where(
                        Membership.organization_id == contract.organization_id
                    )
                ).all()
                for user_id in member_ids:
                    enqueue_notification(
                        session,
                        settings,
                        organization_id=contract.organization_id,
                        user_id=user_id,
                        contract_id=contract.id,
                        kind="review_ready",
                        title="Contract review ready",
                        message=f"{contract.title} is ready to inspect.",
                        action_url=f"/contracts/{contract.id}",
                    )
            if not contract.retain_document:
                asset.status = "purge_pending"
            session.commit()
        if not retain_document:
            delete_pending_sources(database, object_store, asset_ids=[asset.id])

    except Exception as exc:
        logger.error("Review job failed; provider details omitted.", extra={"job_id": job_id})
        public_error = public_review_error(exc)
        with database.session_factory() as session:
            serialize_sqlite_maintenance(session, database)
            job = session.get(ProcessingJob, job_id)
            contract = session.scalar(select(Contract).where(Contract.id == job.contract_id).with_for_update()) if job else None
            if job is not None:
                session.refresh(job)
            if job is None or job.status != "running" or job.started_at != claimed_started_at:
                return
            if contract is None:
                return
            asset = session.get(DocumentAsset, job.document_asset_id)
            expired = source_expired(contract)
            if expired or asset is None or asset.status != "available":
                # Mirror the success boundary before any ordinary failure effects.
                # Claim changes remain a no-op; a current but unusable source is
                # terminal, without restoring source or consuming deletion intent.
                reason = ("The source retention deadline has elapsed." if expired
                          else "The source document is no longer available.")
                job.status = "failed"
                job.progress_step = "Source retention expired" if expired else "Source unavailable"
                job.error_code = "SourceRetentionExpired" if expired else "SourceUnavailable"
                job.error_message = reason
                job.completed_at = utcnow()
                if contract.status == "processing":
                    contract.status = "failed"
                    contract.updated_at = utcnow()
                    import_record = session.scalar(select(IntegrationImport).where(IntegrationImport.contract_id == contract.id))
                    if import_record is not None:
                        import_record.status = "failed"
                        import_record.error_message = reason
                        import_record.updated_at = utcnow()
                session.commit()
                return
            if job:
                job.status = "failed"
                job.progress_step = "Review failed"
                job.error_code = exc.__class__.__name__
                job.error_message = public_error
                job.completed_at = utcnow()
            if contract:
                fail_contract_review(session, settings, contract, job_id, exc.__class__.__name__, public_error)
            session.commit()
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


def run_worker(
    settings: Settings,
    once: bool = False,
    drain: bool = False,
    review_workflow_factory: Callable[[], ReviewWorkflow] = build_review_workflow,
    agents_only: bool = False,
    documents_only: bool = False,
    max_drain_seconds: float | None = None,
) -> None:
    if agents_only and documents_only:
        raise ValueError("Choose one worker lane")
    if settings.agent_worker_mode == "on_demand" and not once:
        drain = True
    database = Database(settings)
    if settings.auto_create_schema:
        database.create_schema()
    object_store = build_object_store(settings)
    review_workflow = None
    worker_id = new_id()
    started = time.monotonic()
    stop_at = None if max_drain_seconds is None else started + max_drain_seconds
    document_recovery_done = False
    try:
        while True:
            if max_drain_seconds is not None and time.monotonic() - started >= max_drain_seconds:
                return
            with database.session_factory() as session:
                session.execute(delete(AgentWorkerHeartbeat).where(AgentWorkerHeartbeat.last_seen_at < utcnow() - timedelta(days=1)))
                heartbeat = session.get(AgentWorkerHeartbeat, worker_id)
                if heartbeat is None:
                    session.add(AgentWorkerHeartbeat(worker_id=worker_id, last_seen_at=utcnow(), lane="agents" if agents_only else "documents" if documents_only else "mixed"))
                else:
                    heartbeat.last_seen_at = utcnow()
                session.commit()
            if not agents_only:
                purge_expired_contracts(database, object_store)
                if not document_recovery_done:
                    recover_exhausted_document_jobs(database, settings, stop_at=stop_at)
                    document_recovery_done = True
                process_lifecycle_reminders(database, settings)
            expired_runs = 0 if documents_only else expire_agent_runs(database, settings, object_store, stop_at=stop_at)
            expired_context = 0
            if not documents_only:
                expired_context = purge_expired_context(database)
                recover_workflow_graphs(database, settings, object_store, stop_at=stop_at)
            if not documents_only and settings.agent_worker_mode == "on_demand":
                nudge_finished_hosted_tasks(database)
                from .agent_wake import recover_hosted_waits
                recover_hosted_waits(database)
            if stop_at is not None and time.monotonic() >= stop_at:
                return
            hosted_claim = None if documents_only else claim_next_hosted_task(database, settings)
            if hosted_claim:
                try:
                    process_hosted_task(database, settings, object_store, *hosted_claim)
                except Exception:
                    logger.error("Hosted planning failed; its durable lease will be recovered.",
                                 extra={"hosted_task_id": hosted_claim[0]})
            agent_claim = None if documents_only else claim_next_agent_action(database, settings)
            if agent_claim:
                try:
                    process_agent_action(database, settings, object_store, *agent_claim)
                except Exception:
                    logger.error("Agent dispatch failed; its durable lease will be recovered.",
                                 extra={"action_id": agent_claim[0]})
                finally:
                    if settings.agent_worker_mode == "on_demand":
                        nudge_hosted_action(database, agent_claim[0])
            job_id = None if agents_only else claim_next_job(database, settings)
            if job_id:
                if review_workflow is None:
                    review_workflow = review_workflow_factory()
                process_job(database, object_store, job_id, settings, review_workflow)
            email_id = None if agents_only else claim_next_email(database, settings)
            if email_id:
                process_email(database, settings, email_id)
            webhook_claim = None if agents_only else claim_next_webhook(database)
            if webhook_claim:
                process_webhook(database, *webhook_claim)
            if once:
                return
            if drain and not job_id and not email_id and not webhook_claim and not agent_claim and not hosted_claim and not expired_runs and not expired_context:
                return
            if drain:
                continue
            if not job_id and not email_id and not webhook_claim and not agent_claim and not hosted_claim:
                time.sleep(settings.worker_poll_seconds)
    finally:
        database.dispose()


def main() -> int:
    parser = argparse.ArgumentParser(description="Process queued LensLayer platform jobs.")
    parser.add_argument("--once", action="store_true", help="Process at most one queued job, then exit.")
    parser.add_argument("--drain", action="store_true", help="Process queued jobs and emails until the queue is empty.")
    parser.add_argument("--agents-only", action="store_true", help="Dedicated hosted planning/action lane; no reviews or emails.")
    parser.add_argument("--documents-only", action="store_true", help="Review/email/retention lane; no agent planning or actions.")
    args = parser.parse_args()
    if args.once and args.drain:
        parser.error("--once and --drain cannot be combined")
    if args.agents_only and args.documents_only:
        parser.error("--agents-only and --documents-only cannot be combined")
    run_worker(get_settings(), once=args.once, drain=args.drain, agents_only=args.agents_only, documents_only=args.documents_only)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
