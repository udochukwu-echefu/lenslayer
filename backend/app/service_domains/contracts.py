from __future__ import annotations

from .base import (
    Any, Contract, ContractResponse, ContractReview, ContractVersion, DocumentAsset,
    HTTPException, JobResponse, Path, ProcessingJob, ReviewResponse, User, hashlib,
    json_dump, json_load, safe_filename, scan_upload, select, timedelta, utcnow, uuid4,
)


class ContractsServiceMixin:
    def create_contract(
        self,
        organization_id: str,
        user: User,
        *,
        original_name: str,
        content_type: str,
        data: bytes,
        title: str,
        counterparty: str,
        contract_type: str,
        review_context: dict[str, Any],
        retain_document: bool,
        retain_source_text: bool,
        retention_days: int,
    ) -> tuple[Contract, DocumentAsset, ProcessingJob]:
        self.workspace.require_roles(
            organization_id,
            user,
            {"owner", "admin", "reviewer"},
            "Viewers have read-only access and cannot upload contracts.",
        )
        filename = safe_filename(original_name)
        suffix = Path(filename).suffix.lower()
        if suffix not in self.settings.allowed_extension_set:
            raise HTTPException(status_code=415, detail="Supported file types are PDF, DOCX, and TXT.")
        if not data:
            raise HTTPException(status_code=400, detail="The uploaded document is empty.")
        if len(data) > self.settings.max_upload_bytes:
            raise HTTPException(status_code=413, detail="The uploaded document exceeds the 25 MB limit.")
        scan_upload(self.settings, filename, data)
        if retention_days not in {7, 30, 90, 365}:
            raise HTTPException(status_code=422, detail="Retention must be 7, 30, 90, or 365 days.")

        now = utcnow()
        contract = Contract(
            organization_id=organization_id,
            created_by_user_id=user.id,
            title=(title or Path(filename).stem).strip()[:512],
            source_name=filename,
            counterparty=counterparty.strip()[:255],
            contract_type=(contract_type or "Unknown").strip()[:255],
            status="processing",
            review_context_json=json_dump(review_context),
            retain_document=retain_document,
            retain_source_text=retain_source_text,
            retention_days=retention_days,
            expires_at=now + timedelta(days=retention_days),
        )
        self.session.add(contract)
        self.session.flush()
        asset_id = str(uuid4())
        storage_key = f"{organization_id}/{contract.id}/{asset_id}{suffix}"
        asset = DocumentAsset(
            id=asset_id,
            organization_id=organization_id,
            contract_id=contract.id,
            storage_key=storage_key,
            original_name=filename,
            content_type=content_type or "application/octet-stream",
            size_bytes=len(data),
            sha256=hashlib.sha256(data).hexdigest(),
        )
        version = ContractVersion(
            organization_id=organization_id,
            contract_id=contract.id,
            document_asset_id=asset.id,
            uploaded_by_user_id=user.id,
            version_number=1,
            label="Original",
            notes="Initial uploaded document.",
            source_name=filename,
            sha256=asset.sha256,
            size_bytes=len(data),
            comparison_json=json_dump(
                {
                    "compared_to_version_id": None,
                    "added": [],
                    "removed": [],
                    "changed_summary": "Original uploaded document.",
                    "added_count": 0,
                    "removed_count": 0,
                }
            ),
        )
        job = ProcessingJob(
            organization_id=organization_id,
            contract_id=contract.id,
            document_asset_id=asset.id,
            status="queued",
            progress_step="Waiting for a review worker",
        )
        self.session.add_all((asset, version, job))
        self._audit(
            organization_id,
            user.id,
            "contract.created",
            contract.id,
            {"source_name": filename, "size_bytes": len(data)},
        )
        self.integrations._enqueue_webhooks(
            organization_id,
            "contract.created",
            contract.id,
            {
                "contract_id": contract.id,
                "title": contract.title,
                "source_name": filename,
                "status": contract.status,
            },
        )
        try:
            self.object_store.put(storage_key, data, asset.content_type)
            self.session.commit()
        except Exception:
            self.session.rollback()
            self.object_store.delete(storage_key)
            raise
        self.session.refresh(contract)
        self.session.refresh(asset)
        self.session.refresh(job)
        return contract, asset, job

    def list_contracts(self, organization_id: str, user: User) -> list[Contract]:
        self.workspace.membership(organization_id, user)
        return list(
            self.session.scalars(
                select(Contract)
                .where(Contract.organization_id == organization_id)
                .order_by(Contract.updated_at.desc())
            ).all()
        )

    def get_contract(self, organization_id: str, contract_id: str, user: User) -> Contract:
        self.workspace.membership(organization_id, user)
        contract = self.session.scalar(
            select(Contract).where(
                Contract.id == contract_id,
                Contract.organization_id == organization_id,
            )
        )
        if contract is None:
            raise HTTPException(status_code=404, detail="Contract not found.")
        return contract

    def get_review(self, organization_id: str, contract_id: str, user: User) -> ContractReview:
        contract = self.get_contract(organization_id, contract_id, user)
        if contract.review is None:
            raise HTTPException(status_code=404, detail="The contract review is not ready.")
        return contract.review

    def list_jobs(self, organization_id: str, contract_id: str, user: User) -> list[ProcessingJob]:
        self.get_contract(organization_id, contract_id, user)
        return list(
            self.session.scalars(
                select(ProcessingJob)
                .where(
                    ProcessingJob.organization_id == organization_id,
                    ProcessingJob.contract_id == contract_id,
                )
                .order_by(ProcessingJob.created_at.desc())
            ).all()
        )

    def delete_contract(self, organization_id: str, contract_id: str, user: User) -> None:
        membership = self.workspace.membership(organization_id, user)
        if membership.role not in {"owner", "admin"}:
            raise HTTPException(status_code=403, detail="Only owners and administrators can delete contracts.")
        contract = self.get_contract(organization_id, contract_id, user)
        keys = [asset.storage_key for asset in contract.assets]
        self._audit(
            organization_id,
            user.id,
            "contract.deleted",
            None,
            {"contract_id": contract.id, "title": contract.title},
        )
        self.session.delete(contract)
        self.session.commit()
        for key in keys:
            self.object_store.delete(key)

    def contract_response(self, contract: Contract) -> ContractResponse:
        latest = max(contract.jobs, key=lambda item: item.created_at) if contract.jobs else None
        return ContractResponse(
            id=contract.id,
            organization_id=contract.organization_id,
            title=contract.title,
            source_name=contract.source_name,
            counterparty=contract.counterparty,
            contract_type=contract.contract_type,
            status=contract.status,
            review_context=json_load(contract.review_context_json, {}),
            retain_document=contract.retain_document,
            retain_source_text=contract.retain_source_text,
            retention_days=contract.retention_days,
            expires_at=contract.expires_at,
            created_at=contract.created_at,
            updated_at=contract.updated_at,
            latest_job=JobResponse.model_validate(latest) if latest else None,
        )

    @staticmethod
    def review_response(review: ContractReview) -> ReviewResponse:
        return ReviewResponse(
            id=review.id,
            analysis=json_load(review.analysis_json, {}),
            quality=json_load(review.quality_json, {}),
            source_text_retained=bool(review.source_text),
            created_at=review.created_at,
            updated_at=review.updated_at,
        )
