from __future__ import annotations

from datetime import timedelta
from typing import Any
import hashlib
import secrets

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import contains_eager

from ..email_delivery import queue_email
from ..models import (
    Membership,
    Organization,
    OrganizationInvitation,
    OrganizationSettings,
    User,
    utcnow,
)
from ..schemas import (
    InvitationPreviewResponse,
    InvitationResponse,
    MembershipResponse,
    OrganizationSettingsResponse,
)
from ..security import Principal
from .common import (
    INVITABLE_ROLES,
    VALID_ROLES,
    email_hint,
    invitation_status,
    normalized_email,
    normalized_role,
)


class WorkspaceServiceMixin:
    def ensure_user(self, principal: Principal) -> User:
        user = self.session.scalar(select(User).where(User.external_subject == principal.subject))
        if user is None:
            user = User(
                external_subject=principal.subject,
                email=principal.email,
                display_name=principal.display_name,
            )
            self.session.add(user)
            try:
                self.session.commit()
            except IntegrityError:
                self.session.rollback()
                user = self.session.scalar(
                    select(User).where(User.external_subject == principal.subject)
                )
                if user is None:
                    raise
            self.session.refresh(user)
            return user
        changed = False
        if principal.email and user.email != principal.email:
            user.email = principal.email
            changed = True
        if principal.display_name and user.display_name != principal.display_name:
            user.display_name = principal.display_name
            changed = True
        if changed:
            self.session.commit()
        return user

    def create_organization(self, user: User, name: str, slug: str) -> Organization:
        normalized_slug = slug.strip().lower()
        if self.session.scalar(select(Organization.id).where(Organization.slug == normalized_slug)):
            raise HTTPException(status_code=409, detail="That organization slug is already in use.")
        organization = Organization(name=name.strip(), slug=normalized_slug)
        self.session.add(organization)
        self.session.flush()
        self.session.add(Membership(organization_id=organization.id, user_id=user.id, role="owner"))
        self.session.add(OrganizationSettings(organization_id=organization.id))
        self._audit(organization.id, user.id, "organization.created", detail={"name": organization.name})
        try:
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise HTTPException(status_code=409, detail="That organization slug is already in use.") from exc
        self.session.refresh(organization)
        return organization

    def list_organizations(self, user: User) -> list[tuple[Organization, str]]:
        rows = self.session.execute(
            select(Organization, Membership.role)
            .join(Membership, Membership.organization_id == Organization.id)
            .where(Membership.user_id == user.id)
            .order_by(Organization.name.asc())
        ).all()
        return [(row[0], row[1]) for row in rows]

    def organization_settings(self, organization_id: str, user: User) -> OrganizationSettings:
        self.membership(organization_id, user)
        settings = self.session.scalar(
            select(OrganizationSettings).where(OrganizationSettings.organization_id == organization_id)
        )
        if settings is None:
            settings = OrganizationSettings(organization_id=organization_id)
            self.session.add(settings)
            self.session.commit()
            self.session.refresh(settings)
        return settings

    def update_organization_settings(
        self,
        organization_id: str,
        user: User,
        changes: dict[str, Any],
    ) -> OrganizationSettings:
        self.require_roles(
            organization_id,
            user,
            {"owner", "admin"},
            "Only owners and administrators can change workspace settings.",
        )
        settings = self.organization_settings(organization_id, user)
        organization = self.session.get(Organization, organization_id)
        if organization is None:
            raise HTTPException(status_code=404, detail="Workspace not found.")
        if "name" in changes and changes["name"] is not None:
            organization.name = changes["name"].strip()
        for field in (
            "default_retention_days",
            "default_retain_document",
            "default_retain_source_text",
            "notification_review_ready",
            "notification_review_failed",
        ):
            if field in changes and changes[field] is not None:
                setattr(settings, field, changes[field])
        settings.updated_at = utcnow()
        self._audit(
            organization_id,
            user.id,
            "organization.settings_updated",
            detail={"changed_fields": sorted(changes)},
        )
        self.session.commit()
        self.session.refresh(settings)
        return settings

    def organization_settings_response(
        self,
        settings: OrganizationSettings,
    ) -> OrganizationSettingsResponse:
        return OrganizationSettingsResponse(
            organization_id=settings.organization_id,
            name=settings.organization.name,
            slug=settings.organization.slug,
            default_retention_days=settings.default_retention_days,
            default_retain_document=settings.default_retain_document,
            default_retain_source_text=settings.default_retain_source_text,
            notification_review_ready=settings.notification_review_ready,
            notification_review_failed=settings.notification_review_failed,
            updated_at=settings.updated_at,
        )

    def membership(self, organization_id: str, user: User) -> Membership:
        membership = self.session.scalar(
            select(Membership).where(
                Membership.organization_id == organization_id,
                Membership.user_id == user.id,
            )
        )
        if membership is None:
            raise HTTPException(status_code=403, detail="You do not have access to this organization.")
        return membership

    def require_roles(self, organization_id: str, user: User, allowed: set[str], detail: str) -> Membership:
        membership = self.membership(organization_id, user)
        if normalized_role(membership.role) not in allowed:
            raise HTTPException(status_code=403, detail=detail)
        return membership

    def list_members(self, organization_id: str, user: User) -> list[Membership]:
        self.membership(organization_id, user)
        return list(
            self.session.scalars(
                select(Membership)
                .join(User, User.id == Membership.user_id)
                .options(contains_eager(Membership.user))
                .where(Membership.organization_id == organization_id)
                .order_by(User.display_name.asc(), User.email.asc())
            ).all()
        )

    def list_invitations(self, organization_id: str, user: User) -> list[OrganizationInvitation]:
        self.require_roles(
            organization_id,
            user,
            {"owner", "admin"},
            "Only owners and administrators can view invitations.",
        )
        return list(
            self.session.scalars(
                select(OrganizationInvitation)
                .where(OrganizationInvitation.organization_id == organization_id)
                .order_by(OrganizationInvitation.created_at.desc())
            ).all()
        )

    def create_invitation(
        self,
        organization_id: str,
        user: User,
        email: str,
        role: str,
    ) -> tuple[OrganizationInvitation, str]:
        actor = self.require_roles(
            organization_id,
            user,
            {"owner", "admin"},
            "Only owners and administrators can invite team members.",
        )
        actor_role = normalized_role(actor.role)
        if role not in INVITABLE_ROLES:
            raise HTTPException(status_code=422, detail="Invitations can grant admin, reviewer, or viewer access.")
        if actor_role == "admin" and role == "admin":
            raise HTTPException(status_code=403, detail="Only an owner can invite another administrator.")

        invite_email = normalized_email(email)
        existing_member = self.session.scalar(
            select(Membership)
            .join(User, User.id == Membership.user_id)
            .where(
                Membership.organization_id == organization_id,
                func.lower(User.email) == invite_email,
            )
        )
        if existing_member is not None:
            raise HTTPException(status_code=409, detail="That person is already a member of this organization.")

        existing_invitation = self.session.scalar(
            select(OrganizationInvitation).where(
                OrganizationInvitation.organization_id == organization_id,
                func.lower(OrganizationInvitation.email) == invite_email,
                OrganizationInvitation.accepted_at.is_(None),
                OrganizationInvitation.revoked_at.is_(None),
                OrganizationInvitation.expires_at > utcnow(),
            )
        )
        if existing_invitation is not None:
            raise HTTPException(status_code=409, detail="A pending invitation already exists for that email address.")

        token = secrets.token_urlsafe(32)
        invitation = OrganizationInvitation(
            organization_id=organization_id,
            created_by_user_id=user.id,
            email=invite_email,
            role=role,
            token_hash=hashlib.sha256(token.encode("utf-8")).hexdigest(),
            expires_at=utcnow() + timedelta(days=7),
        )
        self.session.add(invitation)
        self.session.flush()
        self._audit(
            organization_id,
            user.id,
            "invitation.created",
            detail={"invitation_id": invitation.id, "email": invite_email, "role": role},
        )
        queue_email(
            self.session,
            self.settings,
            organization_id=organization_id,
            recipient=invite_email,
            kind="invitation_created",
            subject="You have been invited to LensLayer",
            message=f"You have been invited to join a LensLayer workspace as {role}.",
            action_url=f"/invite/{token}",
        )
        self.session.commit()
        self.session.refresh(invitation)
        return invitation, token

    def find_invitation(self, token: str) -> OrganizationInvitation:
        if not token:
            raise HTTPException(status_code=404, detail="Invitation not found.")
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        invitation = self.session.scalar(
            select(OrganizationInvitation).where(OrganizationInvitation.token_hash == token_hash)
        )
        if invitation is None:
            raise HTTPException(status_code=404, detail="Invitation not found.")
        return invitation

    def accept_invitation(self, token: str, user: User) -> tuple[Organization, Membership]:
        invitation = self.find_invitation(token)
        status_value = invitation_status(invitation)
        if status_value == "revoked":
            raise HTTPException(status_code=410, detail="This invitation has been revoked.")
        if status_value == "expired":
            raise HTTPException(status_code=410, detail="This invitation has expired.")
        if not user.email or user.email.casefold() != invitation.email.casefold():
            raise HTTPException(
                status_code=403,
                detail="Sign in with the email address that received this invitation.",
            )

        existing = self.session.scalar(
            select(Membership).where(
                Membership.organization_id == invitation.organization_id,
                Membership.user_id == user.id,
            )
        )
        if invitation.accepted_at is not None:
            if existing is None:
                raise HTTPException(status_code=409, detail="This invitation has already been accepted.")
            return invitation.organization, existing

        membership = existing or Membership(
            organization_id=invitation.organization_id,
            user_id=user.id,
            role=invitation.role,
        )
        if existing is None:
            self.session.add(membership)
        invitation.accepted_at = utcnow()
        self._audit(
            invitation.organization_id,
            user.id,
            "invitation.accepted",
            detail={"invitation_id": invitation.id, "role": invitation.role},
        )
        self.session.commit()
        self.session.refresh(membership)
        return invitation.organization, membership

    def revoke_invitation(self, organization_id: str, invitation_id: str, user: User) -> None:
        actor = self.require_roles(
            organization_id,
            user,
            {"owner", "admin"},
            "Only owners and administrators can revoke invitations.",
        )
        invitation = self.session.scalar(
            select(OrganizationInvitation).where(
                OrganizationInvitation.id == invitation_id,
                OrganizationInvitation.organization_id == organization_id,
            )
        )
        if invitation is None:
            raise HTTPException(status_code=404, detail="Invitation not found.")
        if normalized_role(actor.role) == "admin" and invitation.role == "admin":
            raise HTTPException(status_code=403, detail="Only an owner can manage administrator invitations.")
        if invitation.accepted_at is not None:
            raise HTTPException(status_code=409, detail="Accepted invitations cannot be revoked.")
        if invitation.revoked_at is None:
            invitation.revoked_at = utcnow()
            self._audit(
                organization_id,
                user.id,
                "invitation.revoked",
                detail={"invitation_id": invitation.id, "email": invitation.email},
            )
            self.session.commit()

    def update_member_role(
        self,
        organization_id: str,
        membership_id: str,
        role: str,
        user: User,
    ) -> Membership:
        actor = self.require_roles(
            organization_id,
            user,
            {"owner", "admin"},
            "Only owners and administrators can change member roles.",
        )
        if role not in VALID_ROLES:
            raise HTTPException(status_code=422, detail="Unknown organization role.")
        target = self._organization_membership(organization_id, membership_id)
        actor_role = normalized_role(actor.role)
        target_role = normalized_role(target.role)
        if actor_role == "admin" and (target_role in {"owner", "admin"} or role in {"owner", "admin"}):
            raise HTTPException(status_code=403, detail="Only an owner can manage owners or administrators.")
        if target_role == "owner" and role != "owner" and self._owner_count(organization_id) <= 1:
            raise HTTPException(status_code=409, detail="The organization must keep at least one owner.")
        previous_role = target_role
        target.role = role
        self._audit(
            organization_id,
            user.id,
            "membership.role_changed",
            detail={
                "membership_id": target.id,
                "user_id": target.user_id,
                "previous_role": previous_role,
                "role": role,
            },
        )
        self.session.commit()
        self.session.refresh(target)
        return target

    def remove_member(self, organization_id: str, membership_id: str, user: User) -> None:
        actor = self.require_roles(
            organization_id,
            user,
            {"owner", "admin"},
            "Only owners and administrators can remove team members.",
        )
        target = self._organization_membership(organization_id, membership_id)
        actor_role = normalized_role(actor.role)
        target_role = normalized_role(target.role)
        if actor_role == "admin" and target_role in {"owner", "admin"}:
            raise HTTPException(status_code=403, detail="Only an owner can remove owners or administrators.")
        if target_role == "owner" and self._owner_count(organization_id) <= 1:
            raise HTTPException(status_code=409, detail="The organization must keep at least one owner.")
        self._audit(
            organization_id,
            user.id,
            "membership.removed",
            detail={"membership_id": target.id, "user_id": target.user_id, "role": target_role},
        )
        self.session.delete(target)
        self.session.commit()

    def _organization_membership(self, organization_id: str, membership_id: str) -> Membership:
        membership = self.session.scalar(
            select(Membership).where(
                Membership.id == membership_id,
                Membership.organization_id == organization_id,
            )
        )
        if membership is None:
            raise HTTPException(status_code=404, detail="Member not found.")
        return membership

    def _owner_count(self, organization_id: str) -> int:
        return int(
            self.session.scalar(
                select(func.count(Membership.id)).where(
                    Membership.organization_id == organization_id,
                    Membership.role == "owner",
                )
            )
            or 0
        )

    @staticmethod
    def membership_response(membership: Membership) -> MembershipResponse:
        return MembershipResponse(
            id=membership.id,
            user_id=membership.user_id,
            email=membership.user.email,
            display_name=membership.user.display_name,
            role=normalized_role(membership.role),
            created_at=membership.created_at,
        )

    @staticmethod
    def invitation_response(invitation: OrganizationInvitation) -> InvitationResponse:
        return InvitationResponse(
            id=invitation.id,
            email=invitation.email,
            role=invitation.role,
            status=invitation_status(invitation),
            expires_at=invitation.expires_at,
            accepted_at=invitation.accepted_at,
            created_at=invitation.created_at,
        )

    @staticmethod
    def invitation_preview(invitation: OrganizationInvitation) -> InvitationPreviewResponse:
        return InvitationPreviewResponse(
            organization_name=invitation.organization.name,
            organization_slug=invitation.organization.slug,
            email_hint=email_hint(invitation.email),
            role=invitation.role,
            status=invitation_status(invitation),
            expires_at=invitation.expires_at,
        )
