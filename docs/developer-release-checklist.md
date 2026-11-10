# Release checklist

Updated **10 November 2026**. [Current release status](deployment/current-release-status.md)
has the evidence behind each "done" item. Only the owner merges to `main`, deploys
to production or publishes to npm.

## Released 2–10 November

With the owner's approval, #27–#34 are merged and deployed from main `d017d66`.

| Part | Live version | Rolled back from |
|---|---|---|
| API | `lenslayer-api-00027-jol`, image `platform@sha256:014862c4…` | `lenslayer-api-00012-2kb` |
| Review worker job, agent worker | same image; agent worker `lenslayer-agent-worker-00006-57g` | image `sha256:6e5cb793…`, `00005-d8d` |
| Dashboard | Worker version `67176060` | `d560e81b` |
| Landing | Pages deployment `8985780d` | `e60a6b81` |

The first dashboard deploy (`be553c6a`) returned 500 on every dynamic route and was
rolled back within minutes. Next.js 16.4 reads `preview-props.json`, which OpenNext
1.20.11 didn't bundle. [#34](https://github.com/udochukwu-echefu/lenslayer/pull/34)
moved to OpenNext 1.20.15. CI runs `next build`, not the OpenNext Worker build, so it
didn't catch this. Run `opennextjs-cloudflare build` and `wrangler dev` before any
dashboard deploy that changes `next` or `@opennextjs/cloudflare`.

No database migration was part of this release.

## Waiting on the owner

- [ ] **Auth0 account deletion.** Create an Auth0 Machine to Machine app with only `delete:users`
  and set `LENSLAYER_PLATFORM_AUTH0_MANAGEMENT_DOMAIN`, `_CLIENT_ID` and `_CLIENT_SECRET` in
  Secret Manager, then bind them to the API (a new revision). Until then, deleting an account
  erases it in LensLayer but leaves the Auth0 login, so the privacy page's promise isn't kept
  automatically.
- [ ] **Live sign-up check** in a private window: sign up, verify the email, create a workspace
  called "Acme" twice, reset the password.
- [ ] **Q&A cancel:** ask a portfolio question, press Stop within a second, and confirm the API
  log shows the stream cancelled.
- [ ] **Publish `@lenslayer/agent-sdk@0.1.1`.** It's a documentation-only patch, because the 0.1.0 README
  on npm still says "not published to npm". Follow [the distribution procedure](../sdk/DISTRIBUTION.md):
  it needs your GitHub approval and npm sign-in with MFA.
- [ ] **Staging:** renew its R2 credentials. Staging `/health/ready` returns 503 "Object storage is
  unavailable" until then. Staging's API runs the same image as production.

## Decisions for the owner

- **API cold start.** The API takes 10.7s to answer after scaling to zero, measured 2 November.
  #31, now live, starts the API while people sign in. `--min-instances=1` removes it entirely but
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
