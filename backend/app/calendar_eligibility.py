"""Private pilot admission only; never gate revocation or GET-only recovery here."""
from fastapi import HTTPException


def calendar_pilot_eligible(settings, user_id):
    return (not settings.google_calendar_pilot_enabled
            or bool(user_id and user_id in settings.google_calendar_pilot_user_id_set))


def require_calendar_pilot_user(settings, user_id):
    if not calendar_pilot_eligible(settings, user_id):
        raise HTTPException(403, "Calendar is restricted to the private pilot.")
