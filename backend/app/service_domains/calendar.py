"""Tenant OAuth and encrypted credential lifecycle; no tokens in public records."""
from datetime import timedelta

import secrets
from fastapi import HTTPException
from pydantic import Field
from sqlalchemy import delete, func, select, update

from ..agent_schemas import StrictInput
from ..schemas import IntegrationProviderResponse
from ..calendar_connector import (CALENDAR_SCOPE, ConnectorError, GoogleCalendarHTTP,
                                  decrypt_credentials, encrypt_credentials, require_connector_config)
from ..connector_models import CalendarCredential, CalendarOAuthState
from ..calendar_session import verify_session_proof
from ..models import IntegrationConnection, new_id, utcnow
from .agents import canonical_json, digest
from .common import json_dump


class CalendarOAuthStart(StrictInput):
    display_name: str = Field(min_length=1, max_length=255)
    calendar_id: str = Field(min_length=1, max_length=1024, pattern=r"^[^\s*]+$")


class CalendarOAuthCallback(StrictInput):
    state: str = Field(min_length=1, max_length=4096)
    code: str = Field(min_length=1, max_length=4096)


class CalendarServiceMixin:
    def calendar_provider(self, organization_id, user):
        self.workspace.membership(organization_id, user)
        configured = self.session.scalar(select(CalendarCredential.connection_id).join(IntegrationConnection).where(
            CalendarCredential.organization_id == organization_id, CalendarCredential.revoked_at.is_(None),
            CalendarCredential.encrypted_json != "", IntegrationConnection.organization_id == organization_id,
            IntegrationConnection.status == "active").limit(1))
        try:
            require_connector_config(self.settings)
        except HTTPException:
            configured = False
        return IntegrationProviderResponse(provider="google_calendar", display_name="Google Calendar", category="calendar",
            capabilities=["events.create", "events.get"], connection_mode="oauth", configured=bool(configured))

    def _calendar_admin(self, organization_id, user):
        self.workspace.require_roles(organization_id, user, {"owner", "admin"},
                                     "Only owners/admins can configure calendar connections.")

    def _calendar_oauth_binding(self):
        return digest(canonical_json({"client": self.settings.google_calendar_client_id,
            "redirect": self.settings.google_calendar_redirect_uri, "state_key_hash": digest(self.settings.connector_state_signing_key)}))

    def start_calendar_oauth(self, organization_id, user, payload, *, session_proof=None):
        self._calendar_admin(organization_id, user)
        require_connector_config(self.settings)
        fingerprint = verify_session_proof(self.settings, self.session, user, organization_id, "oauth/start", payload.model_dump(), session_proof)
        # No caller-controlled redirect URI. The frontend relays Google's code
        # to the authenticated callback API, then clears the browser URL.
        from urllib.parse import urlencode
        self.session.execute(delete(CalendarOAuthState).where(CalendarOAuthState.expires_at <= utcnow()))
        count = self.session.scalar(select(func.count()).select_from(CalendarOAuthState).where(
            CalendarOAuthState.organization_id == organization_id, CalendarOAuthState.consumed_at.is_(None)))
        if count >= 20:
            raise HTTPException(409, "Too many pending OAuth attempts.")
        expiry = utcnow() + timedelta(minutes=10)
        # Browser sees only an opaque provider nonce, never the session attestation
        # or fingerprint. Legacy states without session binding cannot complete.
        state = secrets.token_urlsafe(32)
        self.session.add(CalendarOAuthState(state_hash=digest(state), organization_id=organization_id,
            user_id=user.id, request_json=canonical_json(payload.model_dump()), expires_at=expiry,
            session_fingerprint=fingerprint, binding_sha256=self._calendar_oauth_binding()))
        self.session.commit()
        return {"authorization_url": "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode({
            "client_id": self.settings.google_calendar_client_id, "redirect_uri": self.settings.google_calendar_redirect_uri,
            "response_type": "code", "scope": CALENDAR_SCOPE, "access_type": "offline", "prompt": "consent",
            "include_granted_scopes": "false", "state": state}), "expires_at": expiry.isoformat()}

    def complete_calendar_oauth(self, organization_id, user, payload, *, session_proof=None):
        self._calendar_admin(organization_id, user)
        require_connector_config(self.settings)
        fingerprint = verify_session_proof(self.settings, self.session, user, organization_id, "oauth/callback", payload.model_dump(), session_proof)
        record = self.session.scalar(select(CalendarOAuthState).where(
            CalendarOAuthState.state_hash == digest(payload.state), CalendarOAuthState.organization_id == organization_id,
            CalendarOAuthState.user_id == user.id))
        if (record is None or record.session_fingerprint != fingerprint or record.binding_sha256 != self._calendar_oauth_binding()):
            raise HTTPException(400, "Invalid OAuth state.")
        changed = self.session.execute(update(CalendarOAuthState).where(
            CalendarOAuthState.id == record.id, CalendarOAuthState.consumed_at.is_(None),
            CalendarOAuthState.expires_at > utcnow()).values(consumed_at=utcnow())
            .execution_options(synchronize_session=False)).rowcount
        if not changed:
            raise HTTPException(409, "OAuth state has already been consumed or expired.")
        request = CalendarOAuthStart.model_validate_json(record.request_json)
        self.session.commit()  # one-time state consumed before network, no locks
        provider = GoogleCalendarHTTP(self.settings)
        try:
            tokens = provider.token(code=payload.code)
        except ConnectorError:
            raise HTTPException(409, "OAuth exchange failed or the exact scope/refresh grant was not supplied. Restart consent.") from None
        finally:
            provider.close()
        self._calendar_admin(organization_id, user)
        connection_id = new_id()
        connection = IntegrationConnection(id=connection_id, organization_id=organization_id, created_by_user_id=user.id,
            provider="google_calendar", display_name=request.display_name, external_account_id="oauth-grant:" + connection_id, status="active",
            capabilities_json=json_dump(["events.create", "events.get"]),
            settings_json=json_dump({"calendar_ids": [request.calendar_id], "credential_mode": "encrypted",
                "identity_kind": "oauth_grant", "provider_account_verified": False, "calendar_ownership_verified": False}))
        self.session.add(connection)
        self.session.flush()
        self.session.add(CalendarCredential(connection_id=connection.id, organization_id=organization_id,
            encrypted_json=encrypt_credentials(self.settings, connection.id, organization_id, tokens),
            scopes_json=json_dump([CALENDAR_SCOPE]), calendar_ids_json=json_dump([request.calendar_id]), session_fingerprint=fingerprint))
        self._audit(organization_id, user.id, "calendar.connected", detail={"connection_id": connection.id})
        self.session.commit()
        return self.integration_connection_response(connection)

    def disconnect_calendar(self, organization_id, connection_id, user, *, session_proof=None):
        self._calendar_admin(organization_id, user)
        verify_session_proof(self.settings, self.session, user, organization_id, "connections/disconnect", {"connection_id": connection_id}, session_proof)
        connection = self.session.scalar(select(IntegrationConnection).where(
            IntegrationConnection.id == connection_id, IntegrationConnection.organization_id == organization_id,
            IntegrationConnection.provider == "google_calendar").with_for_update())
        credential = self.session.get(CalendarCredential, connection_id)
        if connection is None or credential is None or credential.organization_id != organization_id:
            raise HTTPException(404, "Calendar connection not found.")
        connection.status = "revoked"
        credential.revoked_at = credential.revoked_at or utcnow()
        credential.revision += 1
        credential.revoke_pending = bool(credential.encrypted_json)
        self._audit(organization_id, user.id, "calendar.disconnected", detail={"connection_id": connection_id})
        self.session.commit()  # local revocation always wins, even if Google fails
        if credential.revoke_pending:
            try:
                tokens = decrypt_credentials(self.settings, credential)
                provider = GoogleCalendarHTTP(self.settings)
                try:
                    revoked = provider.revoke(tokens["refresh_token"])
                finally:
                    provider.close()
                if revoked:
                    self.session.execute(update(CalendarCredential).where(CalendarCredential.connection_id == connection_id,
                        CalendarCredential.revoked_at.is_not(None)).values(encrypted_json="", revoke_pending=False))
                    self.session.commit()
                    credential.revoke_pending = False
            except (ConnectorError, HTTPException):
                pass
        return {"connection_id": connection_id, "status": "revoked", "provider_revocation_pending": credential.revoke_pending}
