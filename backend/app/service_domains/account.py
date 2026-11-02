"""Self-service account deletion.

Most workspace records keep a non-null reference to the user who created them,
so the user row is scrubbed rather than dropped: shared workspaces keep their
history attributed to "Deleted user", while personal data leaves the system.
Workspaces where the user is the only member are deleted outright, including
their stored files.
"""
from __future__ import annotations

import logging

from fastapi import HTTPException
from sqlalchemy import func, select

from ..agent_models import AgentPrincipal, AgentRun
from ..calendar_connector import ConnectorError, GoogleCalendarHTTP, decrypt_credentials
from ..connector_models import CalendarCredential
from ..identity_provider import delete_identity
from ..models import (
    DocumentAsset,
    Membership,
    Notification,
    Organization,
    PublicApiKey,
    User,
    VerificationDocument,
    utcnow,
)
from .agents import TERMINAL_RUN_STATES
from .common import normalized_role

logger = logging.getLogger(__name__)

DELETION_CONFIRMATION = "DELETE"


class AccountServiceMixin:
    def account_deletion_blockers(self, user: User) -> list[str]:
        """Names of shared workspaces where this user is the last owner."""
        blockers = []
        for membership in self._memberships_of(user):
            if self._member_count(membership.organization_id) > 1 and normalized_role(membership.role) == "owner" \
                    and self._owner_count(membership.organization_id) <= 1:
                blockers.append(membership.organization.name)
        return sorted(blockers)

    def delete_account(self, user: User, confirmation: str) -> dict[str, object]:
        if confirmation.strip() != DELETION_CONFIRMATION:
            raise HTTPException(status_code=400, detail=f'Type "{DELETION_CONFIRMATION}" to confirm account deletion.')
        blockers = self.account_deletion_blockers(user)
        if blockers:
            raise HTTPException(
                status_code=409,
                detail="Make someone else an owner of " + ", ".join(blockers) + " before deleting your account.",
            )

        solo, shared = [], []
        for membership in self._memberships_of(user):
            (solo if self._member_count(membership.organization_id) == 1 else shared).append(membership)
        solo_ids = [membership.organization_id for membership in solo]

        storage_keys = self._storage_keys(solo_ids)
        self._revoke_calendar_grants(solo_ids)
        for membership in shared:
            self._leave_workspace(membership, user)
        for organization_id in solo_ids:
            self.session.delete(self.session.get(Organization, organization_id))

        subject = user.external_subject
        user.external_subject = f"deleted:{user.id}"
        user.email = ""
        user.display_name = ""
        self.session.commit()

        for key in storage_keys:
            try:
                self.object_store.delete(key)
            except Exception:  # the database no longer points at it; log and keep going
                logger.exception("Could not delete stored object during account deletion")
        identity_removed = delete_identity(self.settings, subject)
        return {
            "deleted_workspaces": len(solo_ids),
            "left_workspaces": len(shared),
            "identity_removed": identity_removed,
        }

    def _memberships_of(self, user: User) -> list[Membership]:
        return list(self.session.scalars(select(Membership).where(Membership.user_id == user.id)).all())

    def _member_count(self, organization_id: str) -> int:
        return int(self.session.scalar(
            select(func.count(Membership.id)).where(Membership.organization_id == organization_id)
        ) or 0)

    def _storage_keys(self, organization_ids: list[str]) -> list[str]:
        if not organization_ids:
            return []
        keys = list(self.session.scalars(
            select(DocumentAsset.storage_key).where(DocumentAsset.organization_id.in_(organization_ids))
        ).all())
        keys += self.session.scalars(
            select(VerificationDocument.storage_key).where(VerificationDocument.organization_id.in_(organization_ids))
        ).all()
        return keys

    def _revoke_calendar_grants(self, organization_ids: list[str]) -> None:
        """Best effort: the encrypted tokens are deleted with the workspace either way."""
        if not organization_ids:
            return
        credentials = self.session.scalars(select(CalendarCredential).where(
            CalendarCredential.organization_id.in_(organization_ids),
            CalendarCredential.encrypted_json != "",
        )).all()
        for credential in credentials:
            try:
                tokens = decrypt_credentials(self.settings, credential)
                provider = GoogleCalendarHTTP(self.settings)
                try:
                    provider.revoke(tokens["refresh_token"])
                finally:
                    provider.close()
            except (ConnectorError, HTTPException, KeyError, ValueError):
                logger.warning("Calendar grant revocation failed during account deletion")

    def _leave_workspace(self, membership: Membership, user: User) -> None:
        organization_id = membership.organization_id
        now = utcnow()
        agents = self.session.scalars(select(AgentPrincipal).where(
            AgentPrincipal.organization_id == organization_id,
            AgentPrincipal.delegated_by_user_id == user.id,
            AgentPrincipal.revoked_at.is_(None),
        )).all()
        for item in agents:
            agent = self._lock_agent(item.id)
            agent.revoked_at = now
            for run in self.session.scalars(select(AgentRun).where(
                AgentRun.agent_id == agent.id, AgentRun.status.not_in(TERMINAL_RUN_STATES),
            )).all():
                self._end_run(self._lock_run(run.id), "cancelled", "agent_revoked")
        for api_key in self.session.scalars(select(PublicApiKey).where(
            PublicApiKey.organization_id == organization_id,
            PublicApiKey.created_by_user_id == user.id,
            PublicApiKey.revoked_at.is_(None),
        )).all():
            api_key.revoked_at = now
        for notification in self.session.scalars(select(Notification).where(
            Notification.organization_id == organization_id, Notification.user_id == user.id,
        )).all():
            self.session.delete(notification)
        self._audit(
            organization_id,
            user.id,
            "membership.account_deleted",
            detail={"membership_id": membership.id, "revoked_agents": len(agents)},
        )
        self.session.delete(membership)
