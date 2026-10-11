"""Three-phase external dispatch with immutable intent and fenced outcome commits.

1. lock/authorize/save intent; commit, 2. bounded HTTP with a final pre-insert
fence; no DB locks, 3. lock/fence/read policy again and commit receipt. A lost
worker never commits an outcome; its successor performs GET only once dispatched.
"""
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select, update

from .agent_models import AgentAction, AgentRun
from .agent_resources import CalendarResource
from .agent_schemas import CalendarActionInput
from .agent_tools import get_tool
from .calendar_connector import ConnectorError, GoogleCalendarHTTP, decrypt_credentials, encrypt_credentials
from .connector_models import CalendarCredential
from .models import IntegrationConnection, Membership, utcnow
from .service_domains.agents import TERMINAL_RUN_STATES, canonical_json, digest
from .service_domains.common import aware, json_dump, json_load
from .services import PlatformService


class CalendarLeaseLost(Exception):
    pass


def _locked(database, settings, store, session, action_id, token):
    initial = session.get(AgentAction, action_id)
    if initial is None:
        raise CalendarLeaseLost()
    run = session.get(AgentRun, initial.run_id)
    service = PlatformService(session, settings, store)
    agent = service._lock_agent(run.agent_id)
    run = service._lock_run(run.id)
    action = session.scalar(select(AgentAction).where(AgentAction.id == action_id).with_for_update()
                            .execution_options(populate_existing=True))
    if (action.status != "running" or action.lease_token != token or action.lease_expires_at is None
            or aware(action.lease_expires_at) <= utcnow()):
        raise CalendarLeaseLost()
    return service, agent, run, action


def _authorize(service, agent, run, action, *, recovery=False):
    service._agent_is_active(agent, lock_authority=True)
    if not recovery:
        service._run_is_live(run)
    if digest(action.input_json) != action.input_sha256:
        raise HTTPException(409, "Action binding changed.")
    if agent.require_approval:
        if (action.approval_status != "approved" or action.approved_input_sha256 != action.input_sha256
                or not action.approved_by_user_id or not action.approval_expires_at
                or aware(action.approval_expires_at) <= utcnow()):
            raise HTTPException(409, "Approval is stale or expired.")
        approver = service.session.scalar(select(Membership).where(
            Membership.organization_id == run.organization_id, Membership.user_id == action.approved_by_user_id).with_for_update())
        if not approver or approver.role not in {"owner", "admin"}:
            raise HTTPException(403, "Approver authority removed.")
    payload = CalendarActionInput.model_validate_json(action.input_json)
    evidence = service.validate_agent_calendar_input(agent, run, payload)
    credential = CalendarResource(payload.connection_id, payload.calendar_id).authorize(service, run.organization_id)
    return payload, evidence, credential


def event_intent(agent, run, action, payload, evidence):
    provenance = {"lenslayer_organization": run.organization_id, "lenslayer_connection": payload.connection_id,
                  "lenslayer_calendar": digest(payload.calendar_id), "lenslayer_run": run.id,
                  "lenslayer_action": action.id, "lenslayer_input": action.input_sha256}
    if evidence is not None:
        provenance.update(lenslayer_contract=payload.contract_id, lenslayer_evidence=evidence.id,
                          lenslayer_version=evidence.version_id, lenslayer_source=evidence.source_sha256)
    return {"id": "ll" + action.output_id.replace("-", ""), "summary": payload.summary,
            "description": payload.description, "start": {"dateTime": payload.start_at.isoformat()},
            "end": {"dateTime": payload.end_at.isoformat()}, "visibility": "private",
            "reminders": {"useDefault": False}, "status": "confirmed",
            "extendedProperties": {"private": provenance}}


def _usable_tokens(database, settings, provider, credential, *, force_refresh=False):
    tokens = decrypt_credentials(settings, credential)
    if tokens.get("refresh_expires_at") and datetime.fromisoformat(tokens["refresh_expires_at"]) <= utcnow():
        raise ConnectorError("credential_revoked")
    if not force_refresh and datetime.fromisoformat(tokens["expires_at"]) > utcnow() + timedelta(seconds=30):
        return tokens
    refreshed = provider.token(refresh_token=tokens["refresh_token"])
    if "refresh_expires_at" in tokens and "refresh_expires_at" not in refreshed:
        refreshed["refresh_expires_at"] = tokens["refresh_expires_at"]
    encrypted = encrypt_credentials(settings, credential.connection_id, credential.organization_id, refreshed)
    with database.session_factory() as session:
        connection_active = select(IntegrationConnection.id).where(
            IntegrationConnection.id == credential.connection_id, IntegrationConnection.status == "active").exists()
        changed = session.execute(update(CalendarCredential).where(
            CalendarCredential.connection_id == credential.connection_id, CalendarCredential.revision == credential.revision,
            CalendarCredential.revoked_at.is_(None), connection_active,
        ).values(encrypted_json=encrypted, revision=CalendarCredential.revision + 1)).rowcount
        session.commit()
    if not changed:
        raise ConnectorError("credential_changed")
    credential.revision += 1
    credential.encrypted_json = encrypted
    return refreshed


def process_calendar_action(database, settings, store, action_id, token):
    provider = None
    result, code, uncertain, had_dispatch = {}, "", False, False
    try:
        with database.session_factory() as session:
            service, agent, run, action = _locked(database, settings, store, session, action_id, token)
            had_dispatch = action.dispatch_started_at is not None
            payload, evidence, credential = _authorize(service, agent, run, action, recovery=had_dispatch)
            if action.attempts > settings.agent_action_max_attempts:
                raise ConnectorError("retry_limit_exceeded", uncertain=had_dispatch)
            body = event_intent(agent, run, action, payload, evidence)
            serialized = canonical_json(body)
            if action.dispatch_intent_json != "{}" and action.dispatch_intent_json != serialized:
                raise ConnectorError("intent_binding_changed", uncertain=had_dispatch)
            if action.dispatch_intent_json == "{}":
                action.dispatch_intent_json = serialized
                service._event(run, "action.intent_persisted", {"action_id": action.id, "event_id": body["id"]})
            session.commit()
            # Detached encrypted snapshot; never a live transaction during refresh.
        provider = GoogleCalendarHTTP(settings)
        tokens = _usable_tokens(database, settings, provider, credential)

        def before_write():
            nonlocal had_dispatch
            with database.session_factory() as session:
                service, agent, run, action = _locked(database, settings, store, session, action_id, token)
                current, evidence, credential = _authorize(service, agent, run, action)
                if action.dispatch_started_at is not None:
                    raise CalendarLeaseLost()
                if canonical_json(event_intent(agent, run, action, current, evidence)) != action.dispatch_intent_json:
                    raise ConnectorError("intent_binding_changed")
                action.dispatch_started_at = utcnow()
                service._event(run, "action.dispatched", {"action_id": action.id, "event_id": body["id"]})
                session.commit()
                had_dispatch = True

        try:
            result = provider.create_and_read(payload.calendar_id, body, tokens["access_token"],
                                              reconcile_only=had_dispatch, before_write=before_write,
                                              completion_check=get_tool("google_calendar.events.create").check_completion)
        except ConnectorError as exc:
            if exc.code != "access_token_rejected":
                raise
            tokens = _usable_tokens(database, settings, provider, credential, force_refresh=True)
            # If an insert was already sent, refreshed recovery remains GET-only.
            result = provider.create_and_read(payload.calendar_id, body, tokens["access_token"],
                                              reconcile_only=had_dispatch, before_write=before_write,
                                              completion_check=get_tool("google_calendar.events.create").check_completion)
        result.update(type="calendar_event_created", connection_id=payload.connection_id, calendar_id=payload.calendar_id,
                      summary=payload.summary, start_at=payload.start_at.isoformat(), end_at=payload.end_at.isoformat(),
                      provenance_origin="retained_document" if evidence else "approved_action")
        if evidence:
            result.update(evidence_id=evidence.id, version_id=evidence.version_id, source_sha256=evidence.source_sha256)
    except CalendarLeaseLost:
        return False
    except ConnectorError as exc:
        # A failed lookup before the committed dispatch marker cannot have
        # inserted an event. Provider uncertainty alone is not write uncertainty.
        code = exc.code
        uncertain = had_dispatch and exc.code not in {"provider_event_conflict", "provider_write_rejected"}
        if exc.code in {"credential_revoked", "scope_changed"} and "credential" in locals():
            with database.session_factory() as session:
                changed = session.execute(update(CalendarCredential).where(CalendarCredential.connection_id == credential.connection_id,
                    CalendarCredential.revision == credential.revision).values(revoked_at=utcnow(), revision=CalendarCredential.revision + 1))
                if changed.rowcount:
                    session.execute(update(IntegrationConnection).where(IntegrationConnection.id == credential.connection_id).values(status="revoked"))
                session.commit()
    except HTTPException:
        code, uncertain = "dispatch_policy_denied", had_dispatch
    finally:
        if provider:
            provider.close()

    with database.session_factory() as session:
        try:
            service, agent, run, action = _locked(database, settings, store, session, action_id, token)
            # Even a verified remote object is not authorized run success if the
            # policy/deadline/source/approval was revoked during the network call.
            policy_valid = True
            try:
                _authorize(service, agent, run, action)
            except HTTPException:
                policy_valid = False
            if result:
                partial = not policy_valid or run.status in TERMINAL_RUN_STATES
                result["partial_effect"] = partial
                action.status = "cancelled" if partial else "succeeded"
                action.error_code = "partial_effect" if partial else ""
                action.result_json = json_dump(result)
                service._event(run, "action.partial_effect" if partial else "action.succeeded",
                               {"action_id": action.id, "event_id": result["event_id"], "verified": True})
                if not partial:
                    service.checkpoint_agent_action(run, action, result)
                elif run.status not in TERMINAL_RUN_STATES:
                    service._end_run(run, "failed", "dispatch_policy_denied")
            else:
                action.status = "unknown_outcome" if uncertain else "failed"
                action.error_code = "unknown_outcome" if uncertain else code
                action.result_json = json_dump({"verified": False, "dispatch_may_have_effect": had_dispatch,
                                               "reconciliation_error": code})
                service._event(run, "action." + action.status, {"action_id": action.id, "error_code": action.error_code})
                if run.status not in TERMINAL_RUN_STATES:
                    service._end_run(run, "failed", action.error_code)
            action.completed_at = utcnow()
            with session.no_autoflush:
                fenced = session.execute(update(AgentAction).where(
                    AgentAction.id == action.id, AgentAction.lease_token == token,
                    AgentAction.lease_expires_at > utcnow()).values(lease_token=token)
                    .execution_options(synchronize_session=False)).rowcount
            if not fenced:
                raise CalendarLeaseLost()
            action.lease_token = action.lease_expires_at = None
            session.commit()
            return bool(result and not result.get("partial_effect"))
        except CalendarLeaseLost:
            session.rollback()
            return False
