# Milestone 7.1 and verification operations

This repository contains the complete local product and API surfaces for the remaining intake providers and the verification operations workspace. External provider activation is deliberately deferred until deployment credentials, callback URLs, and production controls are available.

## Built locally

- Contract forwarding address discovery and authenticated forwarded-email intake
- Provider catalog and connection records for Google Drive, OneDrive, SharePoint, Dropbox, Slack, Telegram, and WhatsApp
- Provider-neutral document import endpoint with duplicate-source protection and provenance
- Public API keys, public contract upload/read endpoints, webhook subscriptions, and delivery logs
- Expiring, revocable, upload-limited secure links suitable for email, Slack, Telegram, and WhatsApp delivery
- Private onboarding document storage with randomized object keys, SHA-256 integrity hashes, retention expiry, scan state, extraction state, and reviewer attribution
- Persistent verification queue with priority, assignee, due date, intake channel, and controlled case states
- Append-only assignment history, structured evidence reconciliation, conflict-gated approval, decision history, and case-specific compliance audit events
- OIDC sign-in, sign-in error, sign-out confirmation, signed-out, session-expired, invitation, and workspace-onboarding screens

## Activation deferred

- Provider OAuth applications and callback URLs
- Mail exchanger or inbound-email provider routing to `/intake/email`
- Microsoft Graph, Google Drive, and Dropbox file-download adapters
- Slack and Telegram bot installation and event verification
- WhatsApp Business template approval and outbound message delivery
- Automated malware scanning, OCR/extraction workers for identity documents, issuer checks, liveness, and biometric matching

Credentials must live in the deployment secret manager. The API rejects settings keys containing secret, token, password, or private-key material so connector credentials are not persisted in integration metadata.

## Verification gate

```bash
.venv/bin/python -m unittest discover -s tests
cd dashboard
npm run lint
npx tsc --noEmit --incremental false
npm run build
```
