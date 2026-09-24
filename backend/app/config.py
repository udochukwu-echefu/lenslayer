from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the platform API and worker."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="LENSLAYER_PLATFORM_",
        extra="ignore",
    )

    app_name: str = "LensLayer Platform API"
    environment: str = "local"
    api_prefix: str = "/api/v1"
    database_url: str = "sqlite:///.lenslayer/platform.db"
    auto_create_schema: bool = True
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    auth_mode: str = "local"
    oidc_issuer: str = ""
    oidc_audience: str = ""
    oidc_jwks_url: str = ""
    oidc_email_claim: str = "email"
    oidc_name_claim: str = "name"
    oidc_email_verified_claim: str = "email_verified"
    oidc_require_verified_email: bool = False

    object_storage_backend: str = "local"
    object_storage_root: Path = Path(".lenslayer/platform-files")
    s3_bucket: str = ""
    s3_endpoint_url: str = ""
    s3_region: str = "auto"
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""

    max_upload_bytes: int = 25 * 1024 * 1024
    allowed_extensions: str = ".pdf,.docx,.txt"
    malware_scan_backend: str = "signature"
    cloudmersive_api_key: str = ""
    cloudmersive_api_url: str = "https://api.cloudmersive.com"
    malware_scan_timeout_seconds: float = 10.0
    email_backend: str = "disabled"
    resend_api_key: str = ""
    resend_api_url: str = "https://api.resend.com"
    resend_from_email: str = ""
    dashboard_url: str = "http://localhost:3000"
    email_max_attempts: int = Field(default=5, ge=1, le=20)
    email_lease_seconds: int = Field(default=900, ge=60, le=3600)
    intake_email_domain: str = "intake.lenslayer.local"
    worker_poll_seconds: float = Field(default=2.0, ge=0.2, le=60.0)
    worker_max_attempts: int = Field(default=3, ge=1, le=10)
    worker_lease_seconds: int = Field(default=2100, ge=300, le=7200)
    review_worker_job: str = ""

    @property
    def allowed_extension_set(self) -> set[str]:
        return {item.strip().lower() for item in self.allowed_extensions.split(",") if item.strip()}

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @model_validator(mode="after")
    def validate_security(self) -> "Settings":
        environment = self.environment.lower()
        auth_mode = self.auth_mode.lower()
        storage_backend = self.object_storage_backend.lower()
        if auth_mode not in {"local", "oidc"}:
            raise ValueError("auth_mode must be local or oidc")
        if storage_backend not in {"local", "s3"}:
            raise ValueError("object_storage_backend must be local or s3")
        if environment == "production" and auth_mode != "oidc":
            raise ValueError("Production requires OIDC authentication")
        if environment == "production" and self.auto_create_schema:
            raise ValueError("Production requires Alembic migrations; disable automatic schema creation")
        if environment == "production" and not self.database_url.lower().startswith(
            ("postgresql://", "postgresql+psycopg://")
        ):
            raise ValueError("Production requires PostgreSQL")
        if environment == "production" and storage_backend != "s3":
            raise ValueError("Production requires private S3-compatible object storage")
        malware_backend = self.malware_scan_backend.lower()
        email_backend = self.email_backend.lower()
        if malware_backend not in {"cloudmersive", "signature", "disabled"}:
            raise ValueError("malware_scan_backend must be cloudmersive, signature, or disabled")
        if email_backend not in {"resend", "disabled"}:
            raise ValueError("email_backend must be resend or disabled")
        if environment == "production" and malware_backend != "cloudmersive":
            raise ValueError("Production requires malware scanning through Cloudmersive")
        if environment == "production" and email_backend != "resend":
            raise ValueError("Production requires transactional email through Resend")
        if malware_backend == "cloudmersive" and not self.cloudmersive_api_key:
            raise ValueError("Cloudmersive scanning requires an API key")
        if email_backend == "resend" and not all((self.resend_api_key, self.resend_from_email)):
            raise ValueError("Resend email requires an API key and verified sender")
        if auth_mode == "oidc" and not all((self.oidc_issuer, self.oidc_audience, self.oidc_jwks_url)):
            raise ValueError("OIDC mode requires issuer, audience, and JWKS URL")
        if storage_backend == "s3" and not self.s3_bucket:
            raise ValueError("S3-compatible storage requires a bucket")
        if storage_backend == "s3" and not all((self.s3_endpoint_url, self.s3_access_key_id, self.s3_secret_access_key)):
            raise ValueError("S3-compatible storage requires an endpoint and credentials")
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
