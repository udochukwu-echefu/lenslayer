# Milestone 7.1 intake and integrations

This repository contains the local product and API foundations for the remaining contract-intake providers. External provider activation is deliberately deferred until deployment credentials, callback URLs, and production controls are available. The former identity-verification and onboarding-document module has been removed from the product.

## Built locally

- Contract forwarding address discovery and authenticated forwarded-email intake
- Provider catalog and connection records for Google Drive, OneDrive, SharePoint, Dropbox, Slack, Telegram, and WhatsApp
- Provider-neutral document import endpoint with duplicate-source protection and provenance
- Public API keys, public contract upload/read endpoints, webhook subscriptions, and delivery logs
- OIDC sign-in, sign-in error, sign-out confirmation, signed-out, session-expired, invitation, and workspace-onboarding screens

## Activation deferred

- Provider OAuth applications and callback URLs
- Mail exchanger or inbound-email provider routing to `/intake/email`
- Microsoft Graph, Google Drive, and Dropbox file-download adapters
- Slack and Telegram bot installation and event verification
- WhatsApp Business template approval and outbound message delivery
- Automated OCR and extraction workers for imported contract documents

Credentials must live in the deployment secret manager. The API rejects settings keys containing secret, token, password, or private-key material so connector credentials are not persisted in integration metadata.

## Verification gate

```bash
.venv/bin/python -m unittest discover -s tests
cd dashboard
npm run lint
npx tsc --noEmit --incremental false
npm run build
```
