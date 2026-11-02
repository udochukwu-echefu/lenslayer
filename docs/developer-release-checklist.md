# Release checklist

Updated **2 November 2026**. [Current release status](deployment/current-release-status.md)
has the evidence behind each "done" item. Only the owner merges to `main`, deploys
to production or publishes to npm.

## Waiting on the owner

Merge and deploy in this order. Each PR says what to rebuild.

- [ ] **[#27](https://github.com/udochukwu-echefu/lenslayer/pull/27): dependency patches.** Includes
  the critical Next.js image-optimizer RCE and about 30 pypdf CVEs reachable through uploads.
  Rebuild the API image and the dashboard.
- [ ] **[#28](https://github.com/udochukwu-echefu/lenslayer/pull/28): account deletion, `/privacy`, `/terms`.**
  Before deploying, create an Auth0 Machine to Machine app with only `delete:users`
  and set `LENSLAYER_PLATFORM_AUTH0_MANAGEMENT_DOMAIN`, `_CLIENT_ID` and `_CLIENT_SECRET`
  in Secret Manager. Without them, the privacy page's promise to remove the Auth0
  login isn't kept automatically. Deploy the landing site, the API and the dashboard.
- [ ] **[#29](https://github.com/udochukwu-echefu/lenslayer/pull/29): mobile tap spacing.** Stacked on #28.
- [ ] **[#30](https://github.com/udochukwu-echefu/lenslayer/pull/30): onboarding fixes**, then do its
  five-minute live sign-up, verification, workspace and password-reset check in a private window.
- [ ] **[#31](https://github.com/udochukwu-echefu/lenslayer/pull/31): cold-start wake, `--cpu-boost`,
  Q&A cancel, 92 KB sign-in image.** After deploying, ask a portfolio question on staging,
  press Stop within a second, and confirm the API log shows the stream cancelled.
- [ ] **Publish `@lenslayer/agent-sdk@0.1.1`.** It's a documentation-only patch, because the 0.1.0 README
  on npm still says "not published to npm". Follow [the distribution procedure](../sdk/DISTRIBUTION.md):
  it needs your GitHub approval and npm sign-in with MFA.
- [ ] **Staging:** renew its temporary R2 credentials if staging stays in use.

## Decisions for the owner

- **API cold start.** The API takes 10.7s to answer after scaling to zero, measured 2 November.
  #31 hides most of that behind sign-in for free. `--min-instances=1` removes it entirely but
  keeps one instance running all the time.
- **Legal review.** `/privacy` and `/terms` were written from what the code does, not by a lawyer.
  Get them reviewed before taking payment. Governing law is set to Nigeria.
- **Calendar** stays an owner-only pilot (Google OAuth in testing). A public launch needs
  Google's app verification.
- **DeepSeek** keeps its US$1 / three-admission lifetime cap.

## Done

- `@lenslayer/agent-sdk@0.1.0` published on 16 October. MIT covers the SDK only.
- Core platform PRs #5–#8 merged; **https://app.lenslayer.online** is the canonical dashboard.
  The old `workers.dev` address returns 404 and has been removed from CORS and Auth0.
- One approved production task ran end to end, with a verified Calendar read-back receipt.
- DeepSeek planning pilot enabled under its cap; owner-only Calendar pilot connected.
- 18–19 October, merged and deployed: performance work #21 and #22, landing app links #23,
  Q&A stream completion #24, provider details hidden from failed reviews #25, rounded
  session-expired screen #26.

## For SDK developers

- `npm install @lenslayer/agent-sdk` in a server-side ESM project on Node 20.3+. Start
  with `client.tools()` to see what your credential is allowed to do.
- Use the backend API URL your operator gives you and a scoped `ll_agent_` credential
  issued by a workspace owner or admin. The dashboard URL is not the API URL. Never put
  the credential in browser code, public env vars, source control or logs.
- Agents can't approve their own actions: human approval, scope, deadlines and
  idempotency still apply.
- Changing the SDK: from `sdk/`, run `npm ci`, `npm test` and `npm run release:check`.
  These are local checks, not permission to publish.

Older acceptance records under `docs/architecture/` and `docs/deployment/` are dated
snapshots. Their unchecked boxes aren't a list of current blockers; this file is.
