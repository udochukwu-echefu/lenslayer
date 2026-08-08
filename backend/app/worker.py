from __future__ import annotations

import argparse
import json
import os
import tempfile
import time
from datetime import timedelta
from pathlib import Path

from sqlalchemy import select

from analyzer import analyze_contract, parse_document
from playbooks import DEFAULT_PLAYBOOK, evaluate_report

from .config import Settings, get_settings
from .database import Database
from .models import (
    Contract,
    ContractReview,
    ContractVersion,
    DocumentAsset,
    IntegrationImport,
    LifecycleItem,
    Membership,
    Notification,
    OrganizationSettings,
    PlatformAuditEvent,
    ProcessingJob,
    WebhookDelivery,
    WebhookSubscription,
    utcnow,
)
from .object_storage import ObjectStore, build_object_store
from .services import json_dump, json_load


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


def claim_next_job(database: Database) -> str | None:
    with database.session_factory() as session:
        query = (
            select(ProcessingJob)
            .where(ProcessingJob.status == "queued")
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
    keys: list[str] = []
    with database.session_factory() as session:
        contracts = list(
            session.scalars(
                select(Contract).where(
                    Contract.expires_at.is_not(None),
                    Contract.expires_at <= utcnow(),
                )
            ).all()
        )
        for contract in contracts:
            keys.extend(asset.storage_key for asset in contract.assets)
            session.add(
                PlatformAuditEvent(
                    organization_id=contract.organization_id,
                    actor_user_id=None,
                    contract_id=None,
                    action="contract.expired",
                    detail_json=json_dump({"contract_id": contract.id, "title": contract.title}),
                )
            )
            session.delete(contract)
        session.commit()
    for key in keys:
        object_store.delete(key)
    return len(contracts)


def process_lifecycle_reminders(database: Database) -> int:
    now = utcnow()
    created = 0
    with database.session_factory() as session:
        items = list(
            session.scalars(
                select(LifecycleItem).where(LifecycleItem.status == "active")
            ).all()
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
                    session.add(
                        Notification(
                            organization_id=item.organization_id,
                            user_id=user_id,
                            contract_id=item.contract_id,
                            kind="lifecycle_overdue" if overdue else "lifecycle_reminder",
                            title=f"{item.kind.replace('_', ' ').title()} {'overdue' if overdue else 'due soon'}",
                            message=item.title,
                            action_url=f"/calendar?item={item.id}",
                        )
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
                    session.add(
                        Notification(
                            organization_id=item.organization_id,
                            user_id=user_id,
                            contract_id=item.contract_id,
                            kind="lifecycle_escalated",
                            title="Overdue lifecycle item escalated",
                            message=item.title,
                            action_url=f"/calendar?item={item.id}",
                        )
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


def process_job(database: Database, object_store: ObjectStore, job_id: str) -> None:
    temp_path: str | None = None
    storage_key = ""
    retain_document = True
    try:
        with database.session_factory() as session:
            job = session.get(ProcessingJob, job_id)
            if job is None:
                return
            contract = session.get(Contract, job.contract_id)
            asset = session.get(DocumentAsset, job.document_asset_id)
            if contract is None or asset is None:
                raise RuntimeError("The queued job references a missing contract or document.")
            storage_key = asset.storage_key
            retain_document = contract.retain_document
            data = object_store.get(storage_key)
            suffix = Path(asset.original_name).suffix.lower()

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as handle:
            handle.write(data)
            temp_path = handle.name

        full_text, _, quality = parse_document(temp_path)
        if not full_text.strip():
            raise ValueError("No readable text was found in the document.")

        with database.session_factory() as session:
            job = session.get(ProcessingJob, job_id)
            if job is None:
                return
            job.progress_step = "Analysing clauses and obligations"
            session.commit()

        with database.session_factory() as session:
            job = session.get(ProcessingJob, job_id)
            contract = session.get(Contract, job.contract_id) if job else None
            if job is None or contract is None:
                return
            context = json.loads(contract.review_context_json or "{}")

        report = analyze_contract(full_text, context)
        report["playbook_evaluation"] = evaluate_report(report, DEFAULT_PLAYBOOK)

        if not retain_document:
            object_store.delete(storage_key)

        with database.session_factory() as session:
            job = session.get(ProcessingJob, job_id)
            contract = session.get(Contract, job.contract_id) if job else None
            asset = session.get(DocumentAsset, job.document_asset_id) if job else None
            if job is None or contract is None or asset is None:
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
                asset.status = "deleted"
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
                session.add_all(
                    Notification(
                        organization_id=contract.organization_id,
                        user_id=user_id,
                        contract_id=contract.id,
                        kind="review_ready",
                        title="Contract review ready",
                        message=f"{contract.title} is ready to inspect.",
                        action_url=f"/contracts/{contract.id}",
                    )
                    for user_id in member_ids
                )
            if not contract.retain_document:
                asset.status = "deleted"
            session.commit()

    except Exception as exc:
        with database.session_factory() as session:
            job = session.get(ProcessingJob, job_id)
            contract = session.get(Contract, job.contract_id) if job else None
            if job:
                job.status = "failed"
                job.progress_step = "Review failed"
                job.error_code = exc.__class__.__name__
                job.error_message = str(exc)[:2000]
                job.completed_at = utcnow()
            if contract:
                contract.status = "failed"
                contract.updated_at = utcnow()
                import_record = session.scalar(select(IntegrationImport).where(IntegrationImport.contract_id == contract.id))
                if import_record is not None:
                    import_record.status = "failed"
                    import_record.error_message = str(exc)[:2000]
                    import_record.updated_at = utcnow()
                session.add(
                    PlatformAuditEvent(
                        organization_id=contract.organization_id,
                        actor_user_id=None,
                        contract_id=contract.id,
                        action="review.failed",
                        detail_json=json_dump({"job_id": job_id, "error_code": exc.__class__.__name__}),
                    )
                )
                enqueue_webhook_deliveries(
                    session,
                    contract.organization_id,
                    "contract.review_failed",
                    contract.id,
                    {
                        "contract_id": contract.id,
                        "title": contract.title,
                        "status": contract.status,
                        "error_code": exc.__class__.__name__,
                    },
                )
                preferences = session.scalar(
                    select(OrganizationSettings).where(
                        OrganizationSettings.organization_id == contract.organization_id
                    )
                )
                if preferences is None or preferences.notification_review_failed:
                    member_ids = session.scalars(
                        select(Membership.user_id).where(
                            Membership.organization_id == contract.organization_id
                        )
                    ).all()
                    session.add_all(
                        Notification(
                            organization_id=contract.organization_id,
                            user_id=user_id,
                            contract_id=contract.id,
                            kind="review_failed",
                            title="Contract review needs attention",
                            message=f"{contract.title} could not be processed. Open it to see the error.",
                            action_url=f"/contracts/{contract.id}",
                        )
                        for user_id in member_ids
                    )
            session.commit()
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


def run_worker(settings: Settings, once: bool = False) -> None:
    database = Database(settings)
    if settings.auto_create_schema:
        database.create_schema()
    object_store = build_object_store(settings)
    try:
        while True:
            purge_expired_contracts(database, object_store)
            process_lifecycle_reminders(database)
            job_id = claim_next_job(database)
            if job_id:
                process_job(database, object_store, job_id)
            elif once:
                return
            else:
                time.sleep(settings.worker_poll_seconds)
    finally:
        database.dispose()


def main() -> int:
    parser = argparse.ArgumentParser(description="Process queued Lenslayer platform jobs.")
    parser.add_argument("--once", action="store_true", help="Process at most one queued job, then exit.")
    args = parser.parse_args()
    run_worker(get_settings(), once=args.once)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
