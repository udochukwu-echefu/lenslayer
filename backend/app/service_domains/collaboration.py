from __future__ import annotations

from .base import (
    Any, ApprovalRequest, ApprovalRequestResponse, CONTRACT_DECISIONS, ContractComment,
    ContractCommentResponse, ContractDecision, ContractDecisionResponse, HTTPException,
    Membership, User, json_dump, json_load, normalized_role, select, utcnow,
)


class CollaborationServiceMixin:
    def list_contract_comments(self, organization_id: str, contract_id: str, user: User) -> list[ContractComment]:
        self.contracts.get_contract(organization_id, contract_id, user)
        return list(
            self.session.scalars(
                select(ContractComment)
                .where(
                    ContractComment.organization_id == organization_id,
                    ContractComment.contract_id == contract_id,
                )
                .order_by(ContractComment.created_at.asc())
            ).all()
        )

    def create_contract_comment(
        self,
        organization_id: str,
        contract_id: str,
        user: User,
        body: str,
        mentioned_user_ids: list[str],
    ) -> ContractComment:
        self.workspace.require_roles(
            organization_id,
            user,
            {"owner", "admin", "reviewer"},
            "Viewers cannot add comments.",
        )
        contract = self.contracts.get_contract(organization_id, contract_id, user)
        valid_mentions: list[str] = []
        for mentioned_user_id in dict.fromkeys(mentioned_user_ids):
            if mentioned_user_id == user.id:
                continue
            member = self.session.scalar(
                select(Membership).where(
                    Membership.organization_id == organization_id,
                    Membership.user_id == mentioned_user_id,
                )
            )
            if member is None:
                raise HTTPException(status_code=422, detail="A mentioned user is not a workspace member.")
            valid_mentions.append(mentioned_user_id)
        comment = ContractComment(
            organization_id=organization_id,
            contract_id=contract_id,
            author_user_id=user.id,
            body=body.strip(),
            mentions_json=json_dump(valid_mentions),
        )
        self.session.add(comment)
        self.session.flush()
        for mentioned_user_id in valid_mentions:
            self._notify(
                organization_id,
                mentioned_user_id,
                contract_id,
                "mention",
                f"{user.display_name or user.email} mentioned you",
                f"New comment on {contract.title}.",
                f"/contracts/{contract_id}?tab=collaboration",
            )
        self._audit(
            organization_id,
            user.id,
            "comment.created",
            contract_id,
            {"comment_id": comment.id, "mentioned_user_ids": valid_mentions},
        )
        self.session.commit()
        self.session.refresh(comment)
        return comment

    @staticmethod
    def contract_comment_response(comment: ContractComment) -> ContractCommentResponse:
        return ContractCommentResponse(
            id=comment.id,
            body=comment.body,
            mentioned_user_ids=json_load(comment.mentions_json, []),
            author_user_id=comment.author_user_id,
            author_name=comment.author.display_name,
            author_email=comment.author.email,
            created_at=comment.created_at,
            updated_at=comment.updated_at,
        )

    def list_contract_decisions(self, organization_id: str, contract_id: str, user: User) -> list[ContractDecision]:
        self.contracts.get_contract(organization_id, contract_id, user)
        return list(
            self.session.scalars(
                select(ContractDecision)
                .where(
                    ContractDecision.organization_id == organization_id,
                    ContractDecision.contract_id == contract_id,
                )
                .order_by(ContractDecision.created_at.asc())
            ).all()
        )

    def create_contract_decision(
        self,
        organization_id: str,
        contract_id: str,
        user: User,
        payload: dict[str, Any],
    ) -> ContractDecision:
        self.workspace.require_roles(
            organization_id,
            user,
            {"owner", "admin", "reviewer"},
            "Viewers cannot record review decisions.",
        )
        self.contracts.get_contract(organization_id, contract_id, user)
        if payload["decision"] not in CONTRACT_DECISIONS:
            raise HTTPException(status_code=422, detail="Choose accept, change, escalate, or resolve.")
        decision = ContractDecision(
            organization_id=organization_id,
            contract_id=contract_id,
            reviewer_user_id=user.id,
            decision=payload["decision"],
            subject=payload["subject"].strip(),
            rationale=payload["rationale"].strip(),
            source_reference_json=json_dump(payload.get("source_reference", {})),
        )
        self.session.add(decision)
        self.session.flush()
        self._audit(
            organization_id,
            user.id,
            "contract.decision_recorded",
            contract_id,
            {"decision_id": decision.id, "decision": decision.decision, "subject": decision.subject},
        )
        self.session.commit()
        self.session.refresh(decision)
        return decision

    @staticmethod
    def contract_decision_response(decision: ContractDecision) -> ContractDecisionResponse:
        return ContractDecisionResponse(
            id=decision.id,
            decision=decision.decision,
            subject=decision.subject,
            rationale=decision.rationale,
            source_reference=json_load(decision.source_reference_json, {}),
            reviewer_user_id=decision.reviewer_user_id,
            reviewer_name=decision.reviewer.display_name,
            reviewer_email=decision.reviewer.email,
            created_at=decision.created_at,
        )

    def list_approval_requests(self, organization_id: str, contract_id: str, user: User) -> list[ApprovalRequest]:
        self.contracts.get_contract(organization_id, contract_id, user)
        return list(
            self.session.scalars(
                select(ApprovalRequest)
                .where(
                    ApprovalRequest.organization_id == organization_id,
                    ApprovalRequest.contract_id == contract_id,
                )
                .order_by(ApprovalRequest.created_at.desc())
            ).all()
        )

    def create_approval_request(
        self,
        organization_id: str,
        contract_id: str,
        user: User,
        payload: dict[str, Any],
    ) -> ApprovalRequest:
        self.workspace.require_roles(
            organization_id,
            user,
            {"owner", "admin", "reviewer"},
            "Viewers cannot request approval.",
        )
        contract = self.contracts.get_contract(organization_id, contract_id, user)
        assignee = self.tasks._task_assignee(organization_id, payload.get("assigned_to_user_id"))
        request = ApprovalRequest(
            organization_id=organization_id,
            contract_id=contract_id,
            requested_by_user_id=user.id,
            assigned_to_user_id=assignee.id if assignee else None,
            title=payload["title"].strip(),
            note=payload.get("note", "").strip(),
            conditions_json=json_dump([item.strip() for item in payload.get("conditions", []) if item.strip()]),
            due_at=payload.get("due_at"),
        )
        self.session.add(request)
        self.session.flush()
        recipients = [assignee.id] if assignee else [
            item.user_id for item in self.session.scalars(
                select(Membership).where(
                    Membership.organization_id == organization_id,
                    Membership.role.in_(["owner", "admin"]),
                )
            ).all()
        ]
        for recipient_id in set(recipients):
            if recipient_id == user.id:
                continue
            self._notify(
                organization_id,
                recipient_id,
                contract_id,
                "approval_requested",
                "Approval requested",
                f"{request.title} for {contract.title}.",
                f"/contracts/{contract_id}?tab=collaboration",
            )
        self._audit(
            organization_id,
            user.id,
            "approval.requested",
            contract_id,
            {"approval_id": request.id, "assigned_to_user_id": request.assigned_to_user_id},
        )
        self.session.commit()
        self.session.refresh(request)
        return request

    def resolve_approval_request(
        self,
        organization_id: str,
        contract_id: str,
        approval_id: str,
        user: User,
        payload: dict[str, Any],
    ) -> ApprovalRequest:
        self.workspace.require_roles(
            organization_id,
            user,
            {"owner", "admin", "reviewer"},
            "Viewers cannot decide approval requests.",
        )
        request = self.session.scalar(
            select(ApprovalRequest).where(
                ApprovalRequest.id == approval_id,
                ApprovalRequest.organization_id == organization_id,
                ApprovalRequest.contract_id == contract_id,
            )
        )
        if request is None:
            raise HTTPException(status_code=404, detail="Approval request not found.")
        if request.status != "pending":
            raise HTTPException(status_code=409, detail="This approval request has already been decided.")
        if request.assigned_to_user_id and request.assigned_to_user_id != user.id:
            membership = self.workspace.membership(organization_id, user)
            if normalized_role(membership.role) not in {"owner", "admin"}:
                raise HTTPException(status_code=403, detail="This approval is assigned to another reviewer.")
        status_value = payload["status"]
        conditions = json_load(request.conditions_json, [])
        results = payload.get("condition_results", {})
        if status_value in {"approved", "conditionally_approved"} and conditions:
            missing = [condition for condition in conditions if condition not in results]
            if missing:
                raise HTTPException(status_code=422, detail="Record a result for every approval condition.")
            if status_value == "approved" and not all(results.get(condition) for condition in conditions):
                raise HTTPException(status_code=422, detail="Use conditional approval or changes requested while conditions remain unmet.")
        request.status = status_value
        request.condition_results_json = json_dump(results)
        request.resolution_note = payload["resolution_note"].strip()
        request.resolved_by_user_id = user.id
        request.resolved_at = utcnow()
        self._notify(
            organization_id,
            request.requested_by_user_id,
            contract_id,
            "approval_decided",
            f"Approval {status_value.replace('_', ' ')}",
            request.title,
            f"/contracts/{contract_id}?tab=collaboration",
        )
        self._audit(
            organization_id,
            user.id,
            "approval.decided",
            contract_id,
            {"approval_id": request.id, "status": status_value, "condition_results": results},
        )
        self.session.commit()
        self.session.refresh(request)
        return request

    @staticmethod
    def approval_response(request: ApprovalRequest) -> ApprovalRequestResponse:
        return ApprovalRequestResponse(
            id=request.id,
            contract_id=request.contract_id,
            title=request.title,
            note=request.note,
            status=request.status,
            conditions=json_load(request.conditions_json, []),
            condition_results=json_load(request.condition_results_json, {}),
            requested_by_user_id=request.requested_by_user_id,
            requested_by_name=request.requested_by.display_name,
            assigned_to_user_id=request.assigned_to_user_id,
            assigned_to_name=request.assigned_to.display_name if request.assigned_to else None,
            resolved_by_user_id=request.resolved_by_user_id,
            resolved_by_name=request.resolved_by.display_name if request.resolved_by else None,
            resolution_note=request.resolution_note,
            due_at=request.due_at,
            resolved_at=request.resolved_at,
            created_at=request.created_at,
            updated_at=request.updated_at,
        )
