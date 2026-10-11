"""No wildcards: contract IDs and exact connection/calendar pairs only."""
from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy import select

from .calendar_connector import CALENDAR_SCOPE
from .connector_models import CalendarCredential
from .models import IntegrationConnection
from .service_domains.common import json_load


@dataclass(frozen=True)
class CalendarResource:
    connection_id: str
    calendar_id: str

    def as_dict(self):
        return {"connection_id": self.connection_id, "calendar_id": self.calendar_id}

    def authorize(self, service, organization_id, *grants):
        if any(self.as_dict() not in grant for grant in grants):
            raise HTTPException(403, "Calendar target exceeds delegated scope.")
        connection = service.session.scalar(select(IntegrationConnection).where(
            IntegrationConnection.id == self.connection_id,
            IntegrationConnection.organization_id == organization_id,
            IntegrationConnection.provider == "google_calendar",
            IntegrationConnection.status == "active",
        ).with_for_update())
        credential = service.session.scalar(select(CalendarCredential).where(
            CalendarCredential.connection_id == self.connection_id).with_for_update())
        if (connection is None or credential is None or credential.organization_id != organization_id
                or credential.revoked_at is not None or not credential.encrypted_json
                or self.calendar_id not in json_load(credential.calendar_ids_json, [])
                or json_load(credential.scopes_json, []) != [CALENDAR_SCOPE]):
            raise HTTPException(409, "Calendar connection is unavailable or its grant has changed.")
        return credential
