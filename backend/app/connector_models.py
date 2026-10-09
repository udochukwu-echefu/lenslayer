"""Credentials are isolated from ordinary integration settings and serializers."""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base
from .models import new_id, utcnow


class CalendarCredential(Base):
    __tablename__ = "calendar_credentials"
    connection_id: Mapped[str] = mapped_column(ForeignKey("integration_connections.id", ondelete="CASCADE"), primary_key=True)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    encrypted_json: Mapped[str] = mapped_column(Text)
    scopes_json: Mapped[str] = mapped_column(Text)
    calendar_ids_json: Mapped[str] = mapped_column(Text)
    revision: Mapped[int] = mapped_column(Integer, default=0)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoke_pending: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CalendarOAuthState(Base):
    __tablename__ = "calendar_oauth_states"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    state_hash: Mapped[str] = mapped_column(String(64), unique=True)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("platform_users.id"))
    request_json: Mapped[str] = mapped_column(Text)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
