# Public/private startup boundaries

`/sample` already bypassed WorkspaceProvider. The validated redundant work was its universal SessionProvider/query/module/style ownership, not a workspace API fetch on that route. Public sample/auth/shared layouts now receive theme plus only the query/session providers they actually require. Invitations deliberately keep a session check for signed-in acceptance; anonymous shared/invitation previews do not preflight auth in the transport.

`base.css` and `public.css` are ownership-based, original-order projections of the unchanged private `globals.css`, **not** global dead-CSS deletion. `scripts/extract-startup-css.mjs` retains shared classes and their combinations/media rules. Run it after legacy style edits; `--check` and `startup-css.test.ts` reject stale generated subsets. Final comparison found and corrected missing sign-in icon/button and shared-review heading/empty-state rules; final phone/desktop light/dark captures match all 28 baseline computed-style/geometry inventories exactly. No color/font/layout redesign.

Private layouts alone read a verified browser-safe session projection and parallel `/me` and `/organizations` projections. Fetches are request-local, no-store, no redirects, with 750ms best-effort limits. Slow/API-failure paths fall back to the normal client gates and error/retry handling. Server HTML never includes bearer/refresh tokens or a connector grant. Root/public layouts never fetch private sessions. Read-only server layouts bypass rotating JWT refresh; near-expiry tokens defer refresh to the cookie-writing session/BFF route. NextAuth v4 RSCs strip `expires`, so the projection restores the **original verified JWT expiry**, never a new sliding expiry.

## Follow-up: preserve the boundary during navigation

The original #21 put a separate private layout under each top-level section; despite the correct cold-start/public split, crossing sections destroyed QueryClient and repeated bootstrap. Protected pages now live under one App Router `(workspace)` route group. It changes no URLs. Settings retains only its section-specific wrapper. `/calendar/oauth-return` also stays inside this group because its consent-return component needs the same WorkspaceProvider and query context; AppShell continues its existing callback bypass. Public sample/auth/invite/shared routes remain outside. Cache Components is not enabled.

The shared layout holds shell state and one account-scoped QueryClient across `/tasks → /contracts → /tasks`. Existing fresh/stale/invalidation policies still apply; persistence is not permission to skip BFF authorization. Account/error/signout still synchronously replace/clear the cache, the remembered organization is validated, and an original-session-deadline timer clears private state without polling or server traffic. A refreshed session changes the deadline; no rotating refresh grant is consumed in a read-only layout.

`PROFILE_NAVIGATION=1` on the production fixture records actual React QueryClient context identities via the DevTools commit hook, shell DOM identity, browser/upstream calls, settled content timing and failed/aborted filter requests. `PROFILE_NO_PREFETCH=1` blocks Next router speculative prefetch for a diagnostic comparison, followed by normal-prefetch runs. Both revisions use the **same harness**, synthetic account/workspace, three serial fresh-context sequences and equivalent15-second-fresh cache windows. A slow debounced contract filter followed immediately by Tasks verifies in-flight cancellation. These real mount/request traces complement (not replace) unit/account tests. Use the final follow-up evidence report rather than extrapolating the old initial-load trace to navigation.

Account replacement remounts both query observers and QueryClient synchronously and clears old caches. Session generation fences late preflights/responses. Workspace choice remains localStorage-based and membership-validated; server hydration cannot paint another workspace before the browser restores its choice. The 30-second coalesced transport cache remains; hosted `sessionPolicy="fresh"`, BFF auth, membership, CSRF and private headers remain authoritative.

## Reproduction

```sh
node scripts/extract-startup-css.mjs --check
LENSLAYER_TEST_PYTHON="/absolute/path/to/working/python" npm --prefix dashboard test
npm --prefix dashboard run build
npm --prefix dashboard run start -- --hostname 127.0.0.1 --port 3219
node scripts/profile-public-startup.mjs http://127.0.0.1:3219/sample /absolute/output SOURCE_SHA
# Install profiler tooling separately, not as an app dependency. Supply its exact module path.
PROFILE_MOBILE=1 node scripts/profile-startup-fixture.mjs WORKTREE OUTPUT SOURCE_SHA PUPPETEER_MODULE 3217
```

Run before/after profiles **serially**, not against the same build output while rebuilding and not with concurrent Lighthouse/visual/CPU tests. CDP private traces use three fresh contexts, 390×844/DPR1, 4×CPU, 150ms latency, 1.6Mbit/s down/750Kbit/s up and identical 80ms synthetic upstream. Only encrypted fake local cookies and a fake API are used. The two server metadata requests still exist upstream; the improvement removes browser roundtrips and serialized stages, not authorization. Unthrottled loopback results were unfavorable and are retained in `performance-results.md`, not passed off as production improvements.

Visual capture waits for settled invitation/shared content and fonts plus 600ms, rather than relying on `networkidle0`: Next's speculative sign-in/signup link prefetches prevented continuous network-idle in exploratory captures. Private measurement still uses the same marks/requests/transport on both revisions. The old first fixture lacked useful-content marks; the baseline was rerun with the identical final harness. This is a disclosed harness change, not a changed private workload.
