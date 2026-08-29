from __future__ import annotations

from .base import (
    Any, Contract, ExternalShare, ExternalShareResponse, HTTPException, User, aware,
    hashlib, json_load, secrets, select, timedelta, utcnow,
)


class SharingServiceMixin:
    def list_external_shares(self, organization_id: str, contract_id: str, user: User) -> list[ExternalShare]:
        self.contracts.get_contract(organization_id, contract_id, user)
        return list(
            self.session.scalars(
                select(ExternalShare)
                .where(
                    ExternalShare.organization_id == organization_id,
                    ExternalShare.contract_id == contract_id,
                )
                .order_by(ExternalShare.created_at.desc())
            ).all()
        )

    def create_external_share(
        self,
        organization_id: str,
        contract_id: str,
        user: User,
        payload: dict[str, Any],
    ) -> tuple[ExternalShare, str]:
        self.workspace.require_roles(
            organization_id,
            user,
            {"owner", "admin"},
            "Only owners and administrators can create external links.",
        )
        self.contracts.get_review(organization_id, contract_id, user)
        token = secrets.token_urlsafe(32)
        share = ExternalShare(
            organization_id=organization_id,
            contract_id=contract_id,
            created_by_user_id=user.id,
            token_hash=hashlib.sha256(token.encode()).hexdigest(),
            label=payload["label"].strip(),
            include_evidence=payload.get("include_evidence", True),
            expires_at=utcnow() + timedelta(days=payload.get("expires_in_days", 7)),
        )
        self.session.add(share)
        self.session.flush()
        self._audit(
            organization_id,
            user.id,
            "share.created",
            contract_id,
            {"share_id": share.id, "expires_at": share.expires_at, "include_evidence": share.include_evidence},
        )
        self.session.commit()
        self.session.refresh(share)
        return share, token

    def revoke_external_share(
        self,
        organization_id: str,
        contract_id: str,
        share_id: str,
        user: User,
    ) -> None:
        self.workspace.require_roles(
            organization_id,
            user,
            {"owner", "admin"},
            "Only owners and administrators can revoke external links.",
        )
        share = self.session.scalar(
            select(ExternalShare).where(
                ExternalShare.id == share_id,
                ExternalShare.organization_id == organization_id,
                ExternalShare.contract_id == contract_id,
            )
        )
        if share is None:
            raise HTTPException(status_code=404, detail="Share link not found.")
        share.revoked_at = utcnow()
        self._audit(organization_id, user.id, "share.revoked", contract_id, {"share_id": share.id})
        self.session.commit()

    @staticmethod
    def external_share_response(share: ExternalShare) -> ExternalShareResponse:
        return ExternalShareResponse(
            id=share.id,
            label=share.label,
            include_evidence=share.include_evidence,
            expires_at=share.expires_at,
            revoked_at=share.revoked_at,
            last_viewed_at=share.last_viewed_at,
            view_count=share.view_count,
            created_at=share.created_at,
        )

    def shared_contract(self, token: str) -> tuple[ExternalShare, Contract, dict[str, Any]]:
        share = self.session.scalar(
            select(ExternalShare).where(
                ExternalShare.token_hash == hashlib.sha256(token.encode()).hexdigest()
            )
        )
        if share is None or share.revoked_at is not None or aware(share.expires_at) <= utcnow():
            raise HTTPException(status_code=410, detail="This secure review link is invalid or has expired.")
        contract = self.session.get(Contract, share.contract_id)
        if contract is None or contract.review is None:
            raise HTTPException(status_code=404, detail="Shared review not found.")
        analysis = json_load(contract.review.analysis_json, {})
        if not share.include_evidence:
            risks = []
            for item in analysis.get("risk_assessment", []):
                risks.append({key: value for key, value in item.items() if key not in {"quote", "evidence", "excerpt"}})
            analysis["risk_assessment"] = risks
        share.view_count += 1
        share.last_viewed_at = utcnow()
        self._audit(
            share.organization_id,
            None,
            "share.viewed",
            share.contract_id,
            {"share_id": share.id, "view_count": share.view_count},
        )
        self.session.commit()
        return share, contract, analysis
