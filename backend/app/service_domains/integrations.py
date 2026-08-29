from __future__ import annotations

from .base import (
    API_KEY_SCOPES, Any, ApiKeyCreatedResponse, ApiKeyResponse, Contract, DocumentAsset,
    HTTPException, INTEGRATION_PROVIDERS, INTEGRATION_PROVIDER_CATALOG, IntakeAddressResponse,
    IntegrationConnection, IntegrationConnectionResponse, IntegrationImport,
    IntegrationImportResponse, IntegrationProviderResponse, Membership, ProcessingJob,
    PublicApiKey, User, WEBHOOK_EVENTS, WebhookDelivery, WebhookDeliveryResponse,
    WebhookSubscription, WebhookSubscriptionResponse, hashlib, json_dump, json_load,
    safe_filename, secrets, select, utcnow,
)


class IntegrationsServiceMixin:
    def list_integration_connections(
        self,
        organization_id: str,
        user: User,
        provider: str | None = None,
    ) -> list[IntegrationConnection]:
        self.workspace.membership(organization_id, user)
        query = select(IntegrationConnection).where(IntegrationConnection.organization_id == organization_id)
        if provider:
            if provider not in INTEGRATION_PROVIDERS:
                raise HTTPException(status_code=422, detail="Unknown integration provider.")
            query = query.where(IntegrationConnection.provider == provider)
        return list(
            self.session.scalars(query.order_by(IntegrationConnection.created_at.desc())).all()
        )

    def integration_providers(self, organization_id: str, user: User) -> list[IntegrationProviderResponse]:
        self.workspace.membership(organization_id, user)
        configured = set(
            self.session.scalars(
                select(IntegrationConnection.provider).where(
                    IntegrationConnection.organization_id == organization_id,
                    IntegrationConnection.status == "active",
                )
            ).all()
        )
        return [
            IntegrationProviderResponse(
                provider=provider,
                display_name=details[0],
                category=details[1],
                capabilities=details[2],
                connection_mode=details[3],
                configured=provider in configured or provider in {"email", "public_api", "whatsapp"},
            )
            for provider, details in INTEGRATION_PROVIDER_CATALOG.items()
        ]

    def intake_email_address(self, organization_id: str, user: User) -> IntakeAddressResponse:
        organization = self.workspace.membership(organization_id, user).organization
        domain = self.settings.intake_email_domain.strip().lower()
        return IntakeAddressResponse(
            address=f"contracts+{organization.slug}@{domain}",
            enabled=bool(domain),
            instructions="Forward one PDF, DOCX, or TXT contract per message. The original sender and message ID are retained in the intake audit record.",
        )

    def create_integration_connection(
        self,
        organization_id: str,
        user: User,
        payload: dict[str, Any],
    ) -> IntegrationConnection:
        self.workspace.require_roles(
            organization_id,
            user,
            {"owner", "admin"},
            "Only owners and administrators can manage integrations.",
        )
        provider = payload["provider"]
        if provider not in INTEGRATION_PROVIDERS:
            raise HTTPException(status_code=422, detail="Unknown integration provider.")
        settings = payload.get("settings", {})
        forbidden = {
            key
            for key in settings
            if any(fragment in key.lower() for fragment in ("secret", "token", "password", "private_key"))
        }
        if forbidden:
            raise HTTPException(
                status_code=422,
                detail="Store connector credentials in deployment secrets, not integration settings.",
            )
        provider_defaults = INTEGRATION_PROVIDER_CATALOG[provider]
        capabilities = payload.get("capabilities") or provider_defaults[2]
        connection = IntegrationConnection(
            organization_id=organization_id,
            created_by_user_id=user.id,
            provider=provider,
            display_name=payload["display_name"].strip(),
            external_account_id=payload.get("external_account_id", "").strip(),
            status="active",
            capabilities_json=json_dump(capabilities),
            settings_json=json_dump(settings),
        )
        self.session.add(connection)
        self.session.flush()
        self._audit(
            organization_id,
            user.id,
            "integration.connected",
            detail={"connection_id": connection.id, "provider": provider},
        )
        self.session.commit()
        self.session.refresh(connection)
        return connection

    def revoke_integration_connection(
        self,
        organization_id: str,
        connection_id: str,
        user: User,
    ) -> IntegrationConnection:
        self.workspace.require_roles(
            organization_id,
            user,
            {"owner", "admin"},
            "Only owners and administrators can manage integrations.",
        )
        connection = self.session.scalar(
            select(IntegrationConnection).where(
                IntegrationConnection.id == connection_id,
                IntegrationConnection.organization_id == organization_id,
            )
        )
        if connection is None:
            raise HTTPException(status_code=404, detail="Integration connection not found.")
        connection.status = "revoked"
        connection.updated_at = utcnow()
        self._audit(
            organization_id,
            user.id,
            "integration.revoked",
            detail={"connection_id": connection.id, "provider": connection.provider},
        )
        self.session.commit()
        self.session.refresh(connection)
        return connection

    def create_imported_contract(
        self,
        organization_id: str,
        user: User,
        *,
        provider: str,
        source_type: str,
        original_name: str,
        content_type: str,
        data: bytes,
        title: str,
        counterparty: str = "",
        contract_type: str = "Unknown",
        connection_id: str | None = None,
        external_id: str = "",
        source_url: str = "",
        metadata: dict[str, Any] | None = None,
        retain_document: bool = False,
        retain_source_text: bool = False,
        retention_days: int = 30,
    ) -> tuple[IntegrationImport, Contract, DocumentAsset, ProcessingJob]:
        if provider not in INTEGRATION_PROVIDERS:
            raise HTTPException(status_code=422, detail="Unknown integration provider.")
        connection = None
        if connection_id:
            connection = self.session.scalar(
                select(IntegrationConnection).where(
                    IntegrationConnection.id == connection_id,
                    IntegrationConnection.organization_id == organization_id,
                    IntegrationConnection.provider == provider,
                    IntegrationConnection.status == "active",
                )
            )
            if connection is None:
                raise HTTPException(status_code=422, detail="Choose an active connection for this provider.")
        stable_external_id = external_id.strip() or hashlib.sha256(data).hexdigest()
        existing = self.session.scalar(
            select(IntegrationImport).where(
                IntegrationImport.organization_id == organization_id,
                IntegrationImport.provider == provider,
                IntegrationImport.external_id == stable_external_id,
            )
        )
        if existing is not None:
            raise HTTPException(status_code=409, detail="This source document has already been imported.")
        contract, asset, job = self.contracts.create_contract(
            organization_id,
            user,
            original_name=original_name,
            content_type=content_type,
            data=data,
            title=title,
            counterparty=counterparty,
            contract_type=contract_type,
            review_context={
                "party_role": "Not sure / general review",
                "jurisdiction": "",
                "goal": f"Imported from {provider.replace('_', ' ')}",
                "risk_tolerance": "Balanced",
                "intake_provider": provider,
                "intake_source_type": source_type,
            },
            retain_document=retain_document,
            retain_source_text=retain_source_text,
            retention_days=retention_days,
        )
        import_record = IntegrationImport(
            organization_id=organization_id,
            connection_id=connection.id if connection else None,
            contract_id=contract.id,
            imported_by_user_id=user.id,
            provider=provider,
            source_type=source_type,
            external_id=stable_external_id,
            source_url=source_url.strip()[:1024],
            title=(title or contract.title).strip()[:512],
            original_name=safe_filename(original_name),
            content_type=content_type or "application/octet-stream",
            size_bytes=len(data),
            sha256=asset.sha256,
            status="queued",
            metadata_json=json_dump(metadata or {}),
        )
        self.session.add(import_record)
        self._audit(
            organization_id,
            user.id,
            "integration.import_created",
            contract.id,
            {
                "import_id": import_record.id,
                "provider": provider,
                "source_type": source_type,
                "external_id": stable_external_id,
            },
        )
        self._notify_import(contract, provider)
        self.session.commit()
        self.session.refresh(import_record)
        self.session.refresh(contract)
        self.session.refresh(asset)
        self.session.refresh(job)
        return import_record, contract, asset, job

    def list_integration_imports(
        self,
        organization_id: str,
        user: User,
        provider: str | None = None,
    ) -> list[IntegrationImport]:
        self.workspace.membership(organization_id, user)
        query = select(IntegrationImport).where(IntegrationImport.organization_id == organization_id)
        if provider:
            if provider not in INTEGRATION_PROVIDERS:
                raise HTTPException(status_code=422, detail="Unknown integration provider.")
            query = query.where(IntegrationImport.provider == provider)
        return list(
            self.session.scalars(query.order_by(IntegrationImport.created_at.desc()).limit(100)).all()
        )

    def _notify_import(self, contract: Contract, provider: str) -> None:
        member_ids = self.session.scalars(
            select(Membership.user_id).where(Membership.organization_id == contract.organization_id)
        ).all()
        for user_id in set(member_ids):
            self._notify(
                contract.organization_id,
                user_id,
                contract.id,
                "contract_imported",
                "Contract imported",
                f"{contract.title} was imported from {provider.replace('_', ' ')}.",
                f"/contracts/{contract.id}",
            )

    def create_api_key(self, organization_id: str, user: User, payload: dict[str, Any]) -> ApiKeyCreatedResponse:
        self.workspace.require_roles(
            organization_id,
            user,
            {"owner", "admin"},
            "Only owners and administrators can manage API keys.",
        )
        scopes = [scope for scope in dict.fromkeys(payload.get("scopes", [])) if scope in API_KEY_SCOPES]
        if not scopes:
            raise HTTPException(status_code=422, detail="Choose at least one supported API key scope.")
        token = f"ll_live_{secrets.token_urlsafe(32)}"
        api_key = PublicApiKey(
            organization_id=organization_id,
            created_by_user_id=user.id,
            name=payload["name"].strip(),
            key_prefix=token[:16],
            key_hash=hashlib.sha256(token.encode("utf-8")).hexdigest(),
            scopes_json=json_dump(scopes),
        )
        self.session.add(api_key)
        self.session.flush()
        self._audit(
            organization_id,
            user.id,
            "api_key.created",
            detail={"api_key_id": api_key.id, "name": api_key.name, "scopes": scopes},
        )
        self.session.commit()
        self.session.refresh(api_key)
        return ApiKeyCreatedResponse(api_key=self.api_key_response(api_key), token=token)

    def list_api_keys(self, organization_id: str, user: User) -> list[PublicApiKey]:
        self.workspace.require_roles(
            organization_id,
            user,
            {"owner", "admin"},
            "Only owners and administrators can view API keys.",
        )
        return list(
            self.session.scalars(
                select(PublicApiKey)
                .where(PublicApiKey.organization_id == organization_id)
                .order_by(PublicApiKey.created_at.desc())
            ).all()
        )

    def revoke_api_key(self, organization_id: str, api_key_id: str, user: User) -> None:
        self.workspace.require_roles(
            organization_id,
            user,
            {"owner", "admin"},
            "Only owners and administrators can revoke API keys.",
        )
        api_key = self.session.scalar(
            select(PublicApiKey).where(
                PublicApiKey.id == api_key_id,
                PublicApiKey.organization_id == organization_id,
            )
        )
        if api_key is None:
            raise HTTPException(status_code=404, detail="API key not found.")
        api_key.revoked_at = utcnow()
        self._audit(organization_id, user.id, "api_key.revoked", detail={"api_key_id": api_key.id})
        self.session.commit()

    def authenticate_api_key(self, token: str, required_scope: str) -> tuple[PublicApiKey, User]:
        key_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        api_key = self.session.scalar(select(PublicApiKey).where(PublicApiKey.key_hash == key_hash))
        if api_key is None or api_key.revoked_at is not None:
            raise HTTPException(status_code=401, detail="A valid LensLayer API key is required.")
        scopes = set(json_load(api_key.scopes_json, []))
        if required_scope not in scopes:
            raise HTTPException(status_code=403, detail="The API key does not allow this operation.")
        api_key.last_used_at = utcnow()
        self.session.commit()
        return api_key, api_key.created_by

    def create_webhook_subscription(
        self,
        organization_id: str,
        user: User,
        payload: dict[str, Any],
    ) -> tuple[WebhookSubscription, str]:
        self.workspace.require_roles(
            organization_id,
            user,
            {"owner", "admin"},
            "Only owners and administrators can manage webhooks.",
        )
        events = [event for event in dict.fromkeys(payload.get("events", [])) if event in WEBHOOK_EVENTS]
        if not events:
            raise HTTPException(status_code=422, detail="Choose at least one supported webhook event.")
        signing_secret = f"whsec_{secrets.token_urlsafe(32)}"
        subscription = WebhookSubscription(
            organization_id=organization_id,
            created_by_user_id=user.id,
            target_url=payload["target_url"].strip(),
            description=payload.get("description", "").strip(),
            events_json=json_dump(events),
            signing_secret_hash=hashlib.sha256(signing_secret.encode("utf-8")).hexdigest(),
            secret_prefix=signing_secret[:12],
            status="active",
        )
        self.session.add(subscription)
        self.session.flush()
        self._audit(
            organization_id,
            user.id,
            "webhook.created",
            detail={"webhook_id": subscription.id, "events": events},
        )
        self.session.commit()
        self.session.refresh(subscription)
        return subscription, signing_secret

    def list_webhook_subscriptions(self, organization_id: str, user: User) -> list[WebhookSubscription]:
        self.workspace.require_roles(
            organization_id,
            user,
            {"owner", "admin"},
            "Only owners and administrators can view webhooks.",
        )
        return list(
            self.session.scalars(
                select(WebhookSubscription)
                .where(WebhookSubscription.organization_id == organization_id)
                .order_by(WebhookSubscription.created_at.desc())
            ).all()
        )

    def revoke_webhook_subscription(self, organization_id: str, webhook_id: str, user: User) -> None:
        self.workspace.require_roles(
            organization_id,
            user,
            {"owner", "admin"},
            "Only owners and administrators can revoke webhooks.",
        )
        webhook = self.session.scalar(
            select(WebhookSubscription).where(
                WebhookSubscription.id == webhook_id,
                WebhookSubscription.organization_id == organization_id,
            )
        )
        if webhook is None:
            raise HTTPException(status_code=404, detail="Webhook not found.")
        webhook.status = "revoked"
        webhook.updated_at = utcnow()
        self._audit(organization_id, user.id, "webhook.revoked", detail={"webhook_id": webhook.id})
        self.session.commit()

    def list_webhook_deliveries(
        self,
        organization_id: str,
        user: User,
        webhook_id: str | None = None,
    ) -> list[WebhookDelivery]:
        self.workspace.require_roles(
            organization_id,
            user,
            {"owner", "admin"},
            "Only owners and administrators can view webhook deliveries.",
        )
        query = select(WebhookDelivery).where(WebhookDelivery.organization_id == organization_id)
        if webhook_id:
            query = query.where(WebhookDelivery.subscription_id == webhook_id)
        return list(
            self.session.scalars(query.order_by(WebhookDelivery.created_at.desc()).limit(100)).all()
        )

    def _enqueue_webhooks(
        self,
        organization_id: str,
        event_type: str,
        contract_id: str | None,
        payload: dict[str, Any],
    ) -> None:
        subscriptions = self.session.scalars(
            select(WebhookSubscription).where(
                WebhookSubscription.organization_id == organization_id,
                WebhookSubscription.status == "active",
            )
        ).all()
        for subscription in subscriptions:
            if event_type not in set(json_load(subscription.events_json, [])):
                continue
            self.session.add(
                WebhookDelivery(
                    organization_id=organization_id,
                    subscription_id=subscription.id,
                    contract_id=contract_id,
                    event_type=event_type,
                    payload_json=json_dump({"event": event_type, "data": payload}),
                    status="pending",
                )
            )

    @staticmethod
    def integration_connection_response(connection: IntegrationConnection) -> IntegrationConnectionResponse:
        return IntegrationConnectionResponse(
            id=connection.id,
            organization_id=connection.organization_id,
            provider=connection.provider,
            display_name=connection.display_name,
            external_account_id=connection.external_account_id,
            status=connection.status,
            capabilities=json_load(connection.capabilities_json, []),
            settings=json_load(connection.settings_json, {}),
            last_sync_at=connection.last_sync_at,
            error_message=connection.error_message,
            created_by_user_id=connection.created_by_user_id,
            created_by_name=connection.created_by.display_name,
            created_at=connection.created_at,
            updated_at=connection.updated_at,
        )

    @staticmethod
    def integration_import_response(import_record: IntegrationImport) -> IntegrationImportResponse:
        return IntegrationImportResponse(
            id=import_record.id,
            organization_id=import_record.organization_id,
            connection_id=import_record.connection_id,
            contract_id=import_record.contract_id,
            provider=import_record.provider,
            source_type=import_record.source_type,
            external_id=import_record.external_id,
            source_url=import_record.source_url,
            title=import_record.title,
            original_name=import_record.original_name,
            content_type=import_record.content_type,
            size_bytes=import_record.size_bytes,
            sha256=import_record.sha256,
            status=import_record.status,
            metadata=json_load(import_record.metadata_json, {}),
            error_message=import_record.error_message,
            imported_by_user_id=import_record.imported_by_user_id,
            imported_by_name=import_record.imported_by.display_name if import_record.imported_by else "API key",
            created_at=import_record.created_at,
            updated_at=import_record.updated_at,
        )

    @staticmethod
    def api_key_response(api_key: PublicApiKey) -> ApiKeyResponse:
        return ApiKeyResponse(
            id=api_key.id,
            organization_id=api_key.organization_id,
            name=api_key.name,
            key_prefix=api_key.key_prefix,
            scopes=json_load(api_key.scopes_json, []),
            last_used_at=api_key.last_used_at,
            revoked_at=api_key.revoked_at,
            created_by_user_id=api_key.created_by_user_id,
            created_by_name=api_key.created_by.display_name,
            created_at=api_key.created_at,
        )

    @staticmethod
    def webhook_subscription_response(webhook: WebhookSubscription) -> WebhookSubscriptionResponse:
        return WebhookSubscriptionResponse(
            id=webhook.id,
            organization_id=webhook.organization_id,
            target_url=webhook.target_url,
            description=webhook.description,
            events=json_load(webhook.events_json, []),
            secret_prefix=webhook.secret_prefix,
            status=webhook.status,
            last_delivery_at=webhook.last_delivery_at,
            created_by_user_id=webhook.created_by_user_id,
            created_by_name=webhook.created_by.display_name,
            created_at=webhook.created_at,
            updated_at=webhook.updated_at,
        )

    @staticmethod
    def webhook_delivery_response(delivery: WebhookDelivery) -> WebhookDeliveryResponse:
        return WebhookDeliveryResponse(
            id=delivery.id,
            subscription_id=delivery.subscription_id,
            contract_id=delivery.contract_id,
            event_type=delivery.event_type,
            payload=json_load(delivery.payload_json, {}),
            status=delivery.status,
            attempts=delivery.attempts,
            last_error=delivery.last_error,
            delivered_at=delivery.delivered_at,
            created_at=delivery.created_at,
            updated_at=delivery.updated_at,
        )
