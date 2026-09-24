from __future__ import annotations

from pathlib import Path
from typing import Any
from uuid import uuid4
import hashlib

from fastapi import HTTPException
from sqlalchemy import select

from ..malware import scan_upload
from ..models import (
    ApprovalRequest,
    ContractVersion,
    CounterpartyResponse,
    DocumentAsset,
    LifecycleItem,
    NegotiationItem,
    User,
    WorkflowTask,
    utcnow,
)
from ..schemas import (
    ContractVersionResponse,
    CounterpartyResponseResponse,
    DealPassportResponse,
    NegotiationItemResponse,
    NegotiationSummaryResponse,
)
from .common import json_dump, json_load, safe_filename


class NegotiationServiceMixin:
    def list_contract_versions(self, organization_id: str, contract_id: str, user: User) -> list[ContractVersion]:
        self.contracts.get_contract(organization_id, contract_id, user)
        return list(
            self.session.scalars(
                select(ContractVersion)
                .where(
                    ContractVersion.organization_id == organization_id,
                    ContractVersion.contract_id == contract_id,
                )
                .order_by(ContractVersion.version_number.asc())
            ).all()
        )

    def create_contract_version(
        self,
        organization_id: str,
        contract_id: str,
        user: User,
        *,
        original_name: str,
        content_type: str,
        data: bytes,
        label: str,
        notes: str,
    ) -> ContractVersion:
        self.workspace.require_roles(
            organization_id,
            user,
            {"owner", "admin", "reviewer"},
            "Viewers cannot upload revised documents.",
        )
        contract = self.contracts.get_contract(organization_id, contract_id, user)
        filename = safe_filename(original_name)
        suffix = Path(filename).suffix.lower()
        if suffix not in self.settings.allowed_extension_set:
            raise HTTPException(status_code=415, detail="Supported file types are PDF, DOCX, and TXT.")
        if not data:
            raise HTTPException(status_code=400, detail="The uploaded document is empty.")
        if len(data) > self.settings.max_upload_bytes:
            raise HTTPException(status_code=413, detail="The uploaded document exceeds the 25 MB limit.")
        scan_upload(self.settings, filename, data)

        previous = self.session.scalar(
            select(ContractVersion)
            .where(
                ContractVersion.organization_id == organization_id,
                ContractVersion.contract_id == contract_id,
            )
            .order_by(ContractVersion.version_number.desc())
            .limit(1)
        )
        version_number = (previous.version_number + 1) if previous else 1
        asset_id = str(uuid4())
        storage_key = f"{organization_id}/{contract.id}/{asset_id}{suffix}"
        sha256 = hashlib.sha256(data).hexdigest()
        new_text = self._extract_uploaded_text(filename, data)
        old_text = self._version_text(previous) if previous else ""
        comparison = self._compare_version_texts(old_text, new_text, previous.id if previous else None)
        asset_status = "available" if contract.retain_document else "deleted"
        asset = DocumentAsset(
            id=asset_id,
            organization_id=organization_id,
            contract_id=contract.id,
            storage_key=storage_key,
            original_name=filename,
            content_type=content_type or "application/octet-stream",
            size_bytes=len(data),
            sha256=sha256,
            status=asset_status,
        )
        version = ContractVersion(
            organization_id=organization_id,
            contract_id=contract.id,
            document_asset_id=asset.id,
            uploaded_by_user_id=user.id,
            version_number=version_number,
            label=(label or f"Version {version_number}").strip()[:255],
            notes=notes.strip(),
            source_name=filename,
            sha256=sha256,
            size_bytes=len(data),
            comparison_json=json_dump(comparison),
            extracted_text=new_text if contract.retain_source_text else None,
        )
        self.session.add_all((asset, version))
        self._audit(
            organization_id,
            user.id,
            "contract.version_uploaded",
            contract.id,
            {
                "version_number": version_number,
                "source_name": filename,
                "added_count": comparison["added_count"],
                "removed_count": comparison["removed_count"],
            },
        )
        try:
            self.object_store.put(storage_key, data, asset.content_type)
            if not contract.retain_document:
                self.object_store.delete(storage_key)
            contract.updated_at = utcnow()
            self.session.commit()
        except Exception:
            self.session.rollback()
            self.object_store.delete(storage_key)
            raise
        self.session.refresh(version)
        return version

    def _extract_uploaded_text(self, filename: str, data: bytes) -> str:
        return self.review_workflow.extract_uploaded_text(filename, data)

    def _version_text(self, version: ContractVersion | None) -> str:
        if version is None:
            return ""
        if version.extracted_text:
            return version.extracted_text
        if version.document_asset and version.document_asset.status == "available":
            try:
                data = self.object_store.get(version.document_asset.storage_key)
            except Exception:
                return ""
            return self._extract_uploaded_text(version.document_asset.original_name, data)
        return ""

    def _compare_version_texts(self, old_text: str, new_text: str, previous_id: str | None) -> dict[str, Any]:
        return self.review_workflow.compare_version(old_text, new_text, previous_id)

    @staticmethod
    def contract_version_response(version: ContractVersion) -> ContractVersionResponse:
        comparison = json_load(version.comparison_json, {})
        return ContractVersionResponse(
            id=version.id,
            contract_id=version.contract_id,
            document_asset_id=version.document_asset_id,
            version_number=version.version_number,
            label=version.label,
            notes=version.notes,
            source_name=version.source_name,
            sha256=version.sha256,
            size_bytes=version.size_bytes,
            comparison={
                "compared_to_version_id": comparison.get("compared_to_version_id"),
                "added": comparison.get("added", []),
                "removed": comparison.get("removed", []),
                "changed_summary": comparison.get("changed_summary", ""),
                "added_count": comparison.get("added_count", 0),
                "removed_count": comparison.get("removed_count", 0),
            },
            uploaded_by_user_id=version.uploaded_by_user_id,
            uploaded_by_name=version.uploaded_by.display_name if version.uploaded_by else "System",
            created_at=version.created_at,
        )

    def list_negotiation_items(self, organization_id: str, contract_id: str, user: User) -> list[NegotiationItem]:
        self.contracts.get_contract(organization_id, contract_id, user)
        return list(
            self.session.scalars(
                select(NegotiationItem)
                .where(
                    NegotiationItem.organization_id == organization_id,
                    NegotiationItem.contract_id == contract_id,
                )
                .order_by(NegotiationItem.created_at.asc())
            ).all()
        )

    def create_negotiation_item(
        self,
        organization_id: str,
        contract_id: str,
        user: User,
        payload: dict[str, Any],
    ) -> NegotiationItem:
        self.workspace.require_roles(
            organization_id,
            user,
            {"owner", "admin", "reviewer"},
            "Viewers cannot change the negotiation checklist.",
        )
        self.contracts.get_contract(organization_id, contract_id, user)
        item = NegotiationItem(
            organization_id=organization_id,
            contract_id=contract_id,
            created_by_user_id=user.id,
            title=payload["title"].strip(),
            description=payload.get("description", "").strip(),
            category=payload.get("category", "change"),
            priority=payload.get("priority", "normal"),
            status=payload.get("status", "proposed"),
            our_position=payload.get("our_position", "").strip(),
            counterparty_position=payload.get("counterparty_position", "").strip(),
            source_reference_json=json_dump(payload.get("source_reference", {})),
            resolved_at=utcnow() if payload.get("status") in {"accepted", "rejected", "resolved"} else None,
        )
        self.session.add(item)
        self.session.flush()
        self._audit(
            organization_id,
            user.id,
            "negotiation.item_created",
            contract_id,
            {"negotiation_item_id": item.id, "status": item.status, "priority": item.priority},
        )
        self.session.commit()
        self.session.refresh(item)
        return item

    def update_negotiation_item(
        self,
        organization_id: str,
        contract_id: str,
        item_id: str,
        user: User,
        changes: dict[str, Any],
    ) -> NegotiationItem:
        self.workspace.require_roles(
            organization_id,
            user,
            {"owner", "admin", "reviewer"},
            "Viewers cannot change the negotiation checklist.",
        )
        item = self.session.scalar(
            select(NegotiationItem).where(
                NegotiationItem.id == item_id,
                NegotiationItem.organization_id == organization_id,
                NegotiationItem.contract_id == contract_id,
            )
        )
        if item is None:
            raise HTTPException(status_code=404, detail="Negotiation item not found.")
        for field in ("title", "description", "category", "priority", "status", "our_position", "counterparty_position"):
            if field in changes and changes[field] is not None:
                value = changes[field]
                if isinstance(value, str):
                    value = value.strip()
                setattr(item, field, value)
        if "source_reference" in changes and changes["source_reference"] is not None:
            item.source_reference_json = json_dump(changes["source_reference"])
        if "status" in changes and changes["status"] is not None:
            item.resolved_at = utcnow() if item.status in {"accepted", "rejected", "resolved"} else None
        self._audit(
            organization_id,
            user.id,
            "negotiation.item_updated",
            contract_id,
            {"negotiation_item_id": item.id, "changed_fields": sorted(changes)},
        )
        self.session.commit()
        self.session.refresh(item)
        return item

    @staticmethod
    def negotiation_item_response(item: NegotiationItem) -> NegotiationItemResponse:
        return NegotiationItemResponse(
            id=item.id,
            contract_id=item.contract_id,
            title=item.title,
            description=item.description,
            category=item.category,
            priority=item.priority,
            status=item.status,
            our_position=item.our_position,
            counterparty_position=item.counterparty_position,
            source_reference=json_load(item.source_reference_json, {}),
            created_by_user_id=item.created_by_user_id,
            created_by_name=item.created_by.display_name,
            resolved_at=item.resolved_at,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )

    def list_counterparty_responses(
        self,
        organization_id: str,
        contract_id: str,
        user: User,
    ) -> list[CounterpartyResponse]:
        self.contracts.get_contract(organization_id, contract_id, user)
        return list(
            self.session.scalars(
                select(CounterpartyResponse)
                .where(
                    CounterpartyResponse.organization_id == organization_id,
                    CounterpartyResponse.contract_id == contract_id,
                )
                .order_by(CounterpartyResponse.created_at.desc())
            ).all()
        )

    def create_counterparty_response(
        self,
        organization_id: str,
        contract_id: str,
        user: User,
        payload: dict[str, Any],
    ) -> CounterpartyResponse:
        self.workspace.require_roles(
            organization_id,
            user,
            {"owner", "admin", "reviewer"},
            "Viewers cannot record counterparty responses.",
        )
        self.contracts.get_contract(organization_id, contract_id, user)
        version_id = payload.get("contract_version_id")
        if version_id:
            version = self.session.scalar(
                select(ContractVersion).where(
                    ContractVersion.id == version_id,
                    ContractVersion.organization_id == organization_id,
                    ContractVersion.contract_id == contract_id,
                )
            )
            if version is None:
                raise HTTPException(status_code=422, detail="Choose a version from this contract.")
        related_item_ids = list(dict.fromkeys(payload.get("related_item_ids", [])))
        if related_item_ids:
            existing_ids = set(
                self.session.scalars(
                    select(NegotiationItem.id).where(
                        NegotiationItem.organization_id == organization_id,
                        NegotiationItem.contract_id == contract_id,
                        NegotiationItem.id.in_(related_item_ids),
                    )
                ).all()
            )
            if existing_ids != set(related_item_ids):
                raise HTTPException(status_code=422, detail="Choose checklist items from this contract.")
        response = CounterpartyResponse(
            organization_id=organization_id,
            contract_id=contract_id,
            contract_version_id=version_id,
            recorded_by_user_id=user.id,
            responder_name=payload.get("responder_name", "").strip()[:255],
            channel=payload.get("channel", "email").strip()[:64] or "email",
            body=payload["body"].strip(),
            related_item_ids_json=json_dump(related_item_ids),
        )
        self.session.add(response)
        self.session.flush()
        self._audit(
            organization_id,
            user.id,
            "negotiation.counterparty_response_recorded",
            contract_id,
            {"response_id": response.id, "related_item_ids": related_item_ids, "contract_version_id": version_id},
        )
        self.session.commit()
        self.session.refresh(response)
        return response

    @staticmethod
    def counterparty_response_response(response: CounterpartyResponse) -> CounterpartyResponseResponse:
        return CounterpartyResponseResponse(
            id=response.id,
            contract_id=response.contract_id,
            contract_version_id=response.contract_version_id,
            recorded_by_user_id=response.recorded_by_user_id,
            recorded_by_name=response.recorded_by.display_name,
            responder_name=response.responder_name,
            channel=response.channel,
            body=response.body,
            related_item_ids=json_load(response.related_item_ids_json, []),
            created_at=response.created_at,
        )

    def negotiation_summary(self, organization_id: str, contract_id: str, user: User) -> NegotiationSummaryResponse:
        self.contracts.get_contract(organization_id, contract_id, user)
        versions = self.list_contract_versions(organization_id, contract_id, user)
        items = self.list_negotiation_items(organization_id, contract_id, user)
        responses = self.list_counterparty_responses(organization_id, contract_id, user)
        accepted = [item for item in items if item.status == "accepted"]
        rejected = [item for item in items if item.status == "rejected"]
        unresolved = [item for item in items if item.status in {"proposed", "unresolved"}]
        latest = versions[-1] if versions else None
        parts = [
            f"{len(versions)} document version{'s' if len(versions) != 1 else ''} retained in the history.",
            f"{len(accepted)} accepted change{'s' if len(accepted) != 1 else ''}, {len(rejected)} rejected change{'s' if len(rejected) != 1 else ''}, and {len(unresolved)} unresolved point{'s' if len(unresolved) != 1 else ''}.",
            f"{len(responses)} counterparty response{'s' if len(responses) != 1 else ''} recorded.",
        ]
        if latest:
            parts.append(f"Latest version: {latest.label or latest.source_name} ({latest.comparison_json and json_load(latest.comparison_json, {}).get('changed_summary', '')}).")
        return NegotiationSummaryResponse(
            contract_id=contract_id,
            latest_version=self.contract_version_response(latest) if latest else None,
            version_count=len(versions),
            checklist_count=len(items),
            accepted_changes=[self.negotiation_item_response(item) for item in accepted],
            rejected_changes=[self.negotiation_item_response(item) for item in rejected],
            unresolved_points=[self.negotiation_item_response(item) for item in unresolved],
            counterparty_response_count=len(responses),
            final_summary=" ".join(part for part in parts if part),
        )

    def deal_passport(self, organization_id: str, contract_id: str, user: User) -> DealPassportResponse:
        contract = self.contracts.get_contract(organization_id, contract_id, user)
        review = self.contracts.get_review(organization_id, contract_id, user)
        analysis = json_load(review.analysis_json, {})
        versions = self.list_contract_versions(organization_id, contract_id, user)
        negotiation = self.negotiation_summary(organization_id, contract_id, user)
        approvals = list(self.session.scalars(select(ApprovalRequest).where(
            ApprovalRequest.organization_id == organization_id,
            ApprovalRequest.contract_id == contract_id,
        ).order_by(ApprovalRequest.created_at.desc())).all())
        tasks = list(self.session.scalars(select(WorkflowTask).where(
            WorkflowTask.organization_id == organization_id,
            WorkflowTask.contract_id == contract_id,
            WorkflowTask.status.in_(("open", "in_progress")),
        ).order_by(WorkflowTask.due_at.asc())).all())
        lifecycle = list(self.session.scalars(select(LifecycleItem).where(
            LifecycleItem.organization_id == organization_id,
            LifecycleItem.contract_id == contract_id,
            LifecycleItem.status == "active",
        ).order_by(LifecycleItem.due_at.asc())).all())
        risks = sorted(
            [item for item in analysis.get("risk_assessment", []) if isinstance(item, dict)],
            key=lambda item: {"high": 0, "medium": 1, "low": 2}.get(str(item.get("risk_level", "")).casefold(), 3),
        )[:3]
        reasons: list[str] = []
        if contract.status != "ready":
            reasons.append("The automated review is not ready.")
        high_risks = [item for item in risks if str(item.get("risk_level", "")).casefold() == "high"]
        if high_risks:
            reasons.append(f"{len(high_risks)} high-priority risk finding{'s' if len(high_risks) != 1 else ''} need a decision.")
        if negotiation.unresolved_points:
            reasons.append(f"{len(negotiation.unresolved_points)} negotiation point{'s' if len(negotiation.unresolved_points) != 1 else ''} remain unresolved.")
        pending_approvals = [item for item in approvals if item.status in {"pending", "changes_requested"}]
        if pending_approvals:
            reasons.append(f"{len(pending_approvals)} approval request{'s' if len(pending_approvals) != 1 else ''} remain open.")
        readiness = "blocked" if contract.status != "ready" or pending_approvals else "needs_attention" if reasons or tasks else "ready"
        return DealPassportResponse(
            contract_id=contract.id,
            title=contract.title,
            counterparty=contract.counterparty,
            contract_type=contract.contract_type,
            readiness=readiness,
            readiness_reasons=reasons,
            executive_summary=str(analysis.get("executive_summary") or ""),
            overall_attention=str(analysis.get("overall_attention") or ""),
            top_risks=risks,
            versions=[self.contract_version_response(item) for item in versions],
            negotiation=negotiation,
            approvals=[{
                "id": item.id,
                "title": item.title,
                "status": item.status,
                "assigned_to": item.assigned_to.display_name if item.assigned_to else "",
                "due_at": item.due_at,
            } for item in approvals],
            open_actions=[{
                "id": item.id,
                "title": item.title,
                "priority": item.priority,
                "status": item.status,
                "owner": item.assigned_to_user.display_name if item.assigned_to_user else "",
                "due_at": item.due_at,
            } for item in tasks],
            key_dates=[{
                "id": item.id,
                "kind": item.kind,
                "title": item.title,
                "due_at": item.due_at,
                "owner": item.owner.display_name if item.owner else "",
            } for item in lifecycle],
            generated_at=utcnow(),
        )
