from __future__ import annotations

from html import escape

import httpx
from sqlalchemy.orm import Session

from .config import Settings
from .models import EmailDelivery


def absolute_action_url(settings: Settings, action_url: str) -> str:
    if not action_url:
        return ""
    if action_url.startswith(("https://", "http://")):
        return action_url
    return f"{settings.dashboard_url.rstrip('/')}/{action_url.lstrip('/')}"


def queue_email(
    session: Session,
    settings: Settings,
    *,
    organization_id: str,
    recipient: str,
    kind: str,
    subject: str,
    message: str,
    action_url: str = "",
    user_id: str | None = None,
) -> EmailDelivery | None:
    if settings.email_backend.lower() == "disabled" or not recipient:
        return None
    url = absolute_action_url(settings, action_url)
    action = f' <a href="{escape(url, quote=True)}">Open LensLayer</a>' if url else ""
    text_action = f"\n\nOpen LensLayer: {url}" if url else ""
    delivery = EmailDelivery(
        organization_id=organization_id,
        user_id=user_id,
        kind=kind,
        recipient=recipient,
        subject=subject,
        text_body=f"{message}{text_action}",
        html_body=f"<p>{escape(message)}</p>{action}",
        action_url=url,
    )
    session.add(delivery)
    return delivery


class ResendEmailSender:
    def __init__(self, settings: Settings):
        self.settings = settings

    def send(self, delivery: EmailDelivery) -> str:
        with httpx.Client(timeout=15.0) as client:
            response = client.post(
                f"{self.settings.resend_api_url.rstrip('/')}/emails",
                headers={
                    "Authorization": f"Bearer {self.settings.resend_api_key}",
                    "Idempotency-Key": delivery.id,
                },
                json={
                    "from": self.settings.resend_from_email,
                    "to": [delivery.recipient],
                    "subject": delivery.subject,
                    "html": delivery.html_body,
                    "text": delivery.text_body,
                },
            )
            response.raise_for_status()
            payload = response.json()
        message_id = payload.get("id") if isinstance(payload, dict) else None
        if not isinstance(message_id, str) or not message_id:
            raise RuntimeError("Resend returned an invalid response.")
        return message_id
