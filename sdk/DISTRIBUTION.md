# SDK distribution — prepared, not published

Only `@lenslayer/agent-sdk` is MIT licensed (2026 LensLayer). The repository,
backend and private MCP adapter have **not** been relicensed. Version 0.1.0 is
still unpublished. No release workflow, SDK registry crypto/provenance verification,
OIDC exchange or host/provider acceptance has been exercised by this source audit.

Owner-provided status (2026-10-15): the free **`@lenslayer` npm organization
exists**, owner `udochukwuchibueze`, one member, zero packages; MFA is enabled.
PR #5 is unmerged. `sdk-npm` is main-only with owner review and no admin bypass.
This audit did not query those settings. **Canonical main/source/artifact review,
real signing/bootstrap, trusted publisher configuration and registry acceptance
remain external gates.** Leave `SDK_NPM_PUBLISH_ENABLED` unset until the owner
expressly authorizes the applicable signing/publication window.

This guide supersedes older **SDK distribution** instructions that describe
`UNLICENSED`. Existing release/roadmap records are left unchanged intentionally.

## Local verification

With Node 24.15.0 / npm 11.12.1, Git, tar and OpenSSL available, from the checkout
root (the tests generate disposable self-signed certificate policy fixtures):

```sh
npm --prefix sdk ci --ignore-scripts --no-audit --no-fund
npm --prefix sdk run release:check
node sdk/scripts/release-artifact.mjs pack /absolute/path/to/new-empty-review-directory
node sdk/scripts/release-artifact.mjs verify /absolute/path/to/new-empty-review-directory
```

The bundle contains exactly the tarball, `pack.json`, `review.json`, `SHA256SUMS`.
The archive contains exactly 18 regular files: seven ESM modules and their seven
declarations, `package.json`, `README.md`, `LICENSE`, `CHANGELOG.md`. `package.json`
uses individual paths rather than an open-ended `dist/` glob. The check verifies
the canonical MIT text, metadata, actual archive allowlist, credential patterns,
an **offline** clean installation, public ESM imports and TypeScript declarations.
Credential patterns are not a complete secret scanner: inspect every file.
Local manifests mark tracked working-copy edits with `sourceDirty: true`; these
are not releasable commit attestations. CI rejects dirty tracked source.

To check the *same* tarball after download (not a newly packed substitute):

```sh
cd sdk
node tests/package-check.mjs /absolute/path/to/review/lenslayer-agent-sdk-0.1.0.tgz
```

`SHA256SUMS` is the tarball's SHA-256; `review.json.integrity` and
`pack.json[0].integrity` are the npm SHA-512 SRI value for those same bytes. GitHub's
artifact ZIP digest is a different value and must not be used as the tarball hash.
Verify the tarball locally with `shasum -a 256 <tarball>` (or `sha256sum`) and:

```sh
node --input-type=module -e 'import {readFileSync} from "node:fs"; import {createHash} from "node:crypto"; console.log("sha512-"+createHash("sha512").update(readFileSync(process.argv[1])).digest("base64"))' /absolute/path/to/tarball.tgz
```

## Coordinator setup — must happen before enabling publication

**Release-window contract (snapshot gate + workflow disable/cancellation):**
`SDK_NPM_PUBLISH_ENABLED=true` remains a necessary **dispatch/job snapshot** for
both operations, not a fresh/current repository-variable authorization inside CI.
Changing/deleting that flag alone cannot revoke an already-captured true value.
The previous mandatory CI variable GET has been removed: it requires Variables
repository read permission, which is not an available documented `GITHUB_TOKEN`
workflow permission. No new App/PAT/secrets/grants or permission fallback is used.

Instead, at every release boundary CI freshly GETs the canonical self-workflow
`actions/workflows/sdk-publish.yml` using existing **`actions: read`**, requiring
the exact workflow path, valid ID and `state: active`. Disabled, deleted,
malformed or unreadable state fails closed. Full live-main, version tag,
successful review/attempt/artifact checks are repeated near both external
actions after slow setup, binding the original downloaded review. The owner
must **disable the workflow, cancel in-flight runs and clear the snapshot flag**
when closing the window; see the procedure below. This is a supported narrowed
contract, not a claim that workflow disabling atomically cancels a running job.
The owner verifier still checks the **live variable** and workflow state with
ordinary managed `gh` collaborator permissions. No live API acceptance was run.

These are external prerequisites, **not configured by this source change**:

1. Reconfirm the owner-provided scope/member status, intended maintainers, public
   package and public canonical repository `udochukwu-echefu/lenslayer`. Enable
   owner MFA before any bootstrap or publication. Review/merge PR #5 and review
   the version, SDK-only MIT license, source and changelog. Runtime/MCP remain
   unlicensed; the MCP package remains private.
2. Protect `main`, the two release workflow files and `sdk/scripts/` with appropriate
   owner review. Restrict creation/update/deletion of `sdk-v*` tags to
   release owners. GitHub administrators can bypass code protections; this design
   does not defend against a malicious repository administrator.
3. Create GitHub environment **`sdk-npm`**, configure human owner release approval,
   and allow
   **main only** as a deployment branch. A YAML `environment:` alone does not
   create these protections; do not enable publishing without confirming them.
   Preserve the configured owner reviewer and disabled admin bypass. Independent
   review/self-review prevention can be stronger protections; they are not assumed.
4. **For an existing package**, in npm trusted publishers bind this package to GitHub owner
   `udochukwu-echefu`, repository `lenslayer`, workflow filename `sdk-publish.yml`,
   environment `sdk-npm`. Enable direct `npm publish`, not dist-tag management.
   Use 2FA and disallow token-based publishing. No PAT, npm token or
   `NODE_AUTH_TOKEN` secret is required or accepted by this workflow.
5. For the nonexistent first package, use the separate owner-reviewed **detached
   signing operation** below before configuring package-scoped trust. Ordinary
   direct OIDC cannot bootstrap its own trust; there is no token/manual fallback
   from a failed OIDC job.
   New trusted-publisher configurations currently expire if unused for two days;
   coordinate setup and approval accordingly.
6. Only for the approved operation/window set repository variable
   **`SDK_NPM_PUBLISH_ENABLED=true`** and ensure the workflow is enabled. This
   snapshot gate applies to both direct publication and detached signing. Leave
   it unset/false otherwise; clearing it alone does not close in-flight work.

### Required owner close procedure — disable, clear, cancel, confirm

These are **future human owner commands**, not operations performed by this
review or automated grants to CI. Use the owner's existing managed GitHub CLI
session (or the equivalent GitHub UI) with normal repository administration/run
cancellation authority; do not send an owner token to CI.

1. Stop authorizing SDK releases; disable the publisher workflow and clear the
   snapshot flag promptly:

   ```sh
   gh workflow disable sdk-publish.yml --repo udochukwu-echefu/lenslayer
   gh variable set SDK_NPM_PUBLISH_ENABLED --body false --repo udochukwu-echefu/lenslayer
   ```

2. Inventory **all** non-completed runs of that workflow, including queued,
   waiting-for-approval, pending and running jobs. Do not cancel only the visible
   running job or assume disabling cancelled it. The paginated read includes
   every branch/attempt represented in the workflow's run list:

   ```sh
   gh api --hostname github.com --method GET --paginate 'repos/udochukwu-echefu/lenslayer/actions/workflows/sdk-publish.yml/runs?per_page=100' --jq '.workflow_runs[] | select(.status != "completed") | {id, status, head_branch}'
   gh run cancel "<RUN_ID>" --repo udochukwu-echefu/lenslayer
   gh run view "<RUN_ID>" --repo udochukwu-echefu/lenslayer --json status,conclusion
   ```

   Repeat cancellation for **each** non-completed run and re-inventory until all
   are terminal. If an already requested cancellation does not complete, owner
   may use the official `gh run cancel "<RUN_ID>" --force --repo ...` command,
   then verify again. Neither a 202/cancellation request nor `cancelled` conclusion
   proves an earlier npm/Sigstore request did not already succeed.
3. Confirm workflow `state` is `disabled_manually`, flag value is false/unset and
   no non-completed release run remains. Inspect any possibly completed external
   signing/upload and actual registry evidence; never blindly retry/bump/unpublish.
   Discard the manual handoff authorization; an existing bundle's signature is
   not revoked by closure, and a previous verifier success must not be reused.
4. Reopening is a separate explicit owner decision after source/artifact review:
   confirm old runs are terminal, restore the flag for the approved window and
   explicitly enable the workflow with `gh workflow enable sdk-publish.yml --repo
   udochukwu-echefu/lenslayer`. Make a **new dispatch** and obtain fresh owner
   approval, especially for detached signing (attempt 1 only). Never resume/rerun
   a stale detached operation as a substitute.

Disabling/clearing/cancelling is not guaranteed instant rollback. A job can pass
the final `active` GET and send an external request before disable/cancel takes
effect. Public signing/log entries and published packages are not undone by
cancellation; owner observation and real post-action checks remain mandatory.

### First-package bootstrap — prepared for review, never automatically published

This design changes **unpublished source before its first immutable artifact
review**. `publishConfig` no longer defaults automatic provenance generation:
npm treats it as conflicting with the official `--provenance-file` option. It is
never set to false. Every controlled path instead explicitly requires provenance:
normal OIDC uses `--provenance`, detached mode signs/verifies a real bundle, and
the owner uses the exact `.tgz` with `--provenance-file`. Source-directory
`prepublishOnly` rejects missing explicit `--provenance`. Arbitrary owner commands
with `--ignore-scripts` cannot be policed by a source hook; follow this procedure.
Runtime dependencies, SDK-only license, exports and the 18-file allowlist are
unchanged. `sigstore@4.1.1` is dev-only and locked; Node 24.15.0/npm 11.12.1 remain
the release/owner toolchain. Never install or upgrade tools globally as a workaround.

**The following are future owner steps, not authorization or evidence of execution.
They require independent approval of this snapshot/cancellation contract:**

1. Merge/review the final source on protected public canonical main, including
   this metadata change. Complete steps 1–3 of the human artifact review below:
   obtain the successful real main review run/attempt, independently review the
   tarball/hash/SHA-512 and create the protected version tag at that exact SHA.
   The current archive is not that artifact. Do not repack reviewed bytes.
2. Owner authorizes the signing window, preserves the main-only owner-approved
   `sdk-npm` environment/no admin bypass, enables the existing repository flag,
   and dispatches **the same `sdk-publish.yml` on main** with explicit operation:

   ```sh
   gh workflow run sdk-publish.yml --repo udochukwu-echefu/lenslayer --ref main -f operation=detached-provenance -f version=0.1.0 -f review_run_id="$REVIEW_RUN_ID" -f sha256="$TARBALL_SHA256" -f 'confirmation=sign @lenslayer/agent-sdk@0.1.0'
   ```

   **Detached signing must be attempt 1 of a fresh workflow dispatch.** Never use
   “Re-run jobs” for this operation; after any rerun, dispatch a new run and obtain
   fresh owner approval. The source policy, signer and owner handoff verifier all
   reject attempt 2+ even when signed metadata matches the current attempt.
   The official approval-history API is run-wide and exposes no approval
   timestamp or attempt number, so its history cannot authenticate a rerun's
   approval. Restricting to attempt 1 prevents reuse from an earlier attempt of
   that run; current owner-review configuration alone is not approval evidence.

   The nonprivileged verify job runs as usual. After owner approval, the separate
   signing job repeats source/tag/live-main/review-attempt/hash guards, installs
   locked dev tooling without lifecycle scripts or npm credentials, and signs
   precisely the original `.tgz` with official `sigstore.attest`. It verifies the
   certificate, log-backed signature, exact workflow identity, bytes and source
   before exporting anything. No npm token, package trust, staging or registry
   write is involved. **Fulcio/Rekor signing is a real external operation** and
   publicly logs provenance information; approval must authorize that disclosure.
3. Download the successful signing run's separate artifact
   `sdk-bootstrap-<version>-<sourceSHA>-<signingRunID>-<signingAttempt>` into a new
   inspection directory. It contains the untouched `review/` four-file bundle,
   `provenance.sigstore.json`, signed `handoff.json` fields and their checksum file.
   The sidecar itself is not a signature: its exact contents must match the
   cryptographically verified SLSA internal parameters. Keep the signing run and
   attempt from the actual run, not an untrusted sidecar. The signed
   `publishEnabled` field records the signing-job **snapshot only**, not a live
   variable observation or irrevocable release permission.
4. In a checkout of the reviewed main commit, install only locked dev dependencies
   without lifecycle scripts. The owner uses their **ordinary official `gh` CLI
   managed session** for fixed read-only canonical REST requests; no token is
   extracted or passed to the verifier. Live repository-variable/environment
   reads require appropriate collaborator permissions. Run:

   ```sh
   npm --prefix sdk ci --ignore-scripts --no-audit --no-fund
   node sdk/scripts/verify-handoff.mjs "/absolute/path/to/handoff" 0.1.0 "$TARBALL_SHA256" "$SIGNING_RUN_ID" "$SIGNING_RUN_ATTEMPT"
   ```

   Verification requires real Sigstore cryptography, exact signer/subject/hash/
   source/builder/signing invocation, live main and peeled version tag, live owner-read enable
   flag, a canonical successful **first-attempt signing run**, the review run's
   current attempt,
   matching unexpired review/handoff artifacts, actual owner approval and current
   owner-review/main-only environment policy and enabled self-workflow state. Authentication/network/schema
   failures stop the handoff. No offline/mock CLI acceptance option exists.
   Handoffs expire after **24 hours** (despite seven-day artifact retention).
   Any newer main release or review dispatch conservatively supersedes the handoff,
   even if failed/in progress. A signing rerun invalidates the handoff regardless
   of unchanged owner approval history; the verifier re-reads signing-attempt
   status at the end as well. Obtain fresh dispatch/review/approval rather than
   bypassing these checks.
5. Keep main/release controls stable. Check the verified values immediately before
   the owner performs authentication and publication in their own Terminal:

   ```sh
   npm login --auth-type=web --registry=https://registry.npmjs.org/
   npm publish "/absolute/path/to/handoff/review/lenslayer-agent-sdk-0.1.0.tgz" --provenance-file="/absolute/path/to/handoff/provenance.sigstore.json" --ignore-scripts --access public --tag latest --registry=https://registry.npmjs.org/
   ```

   Owner completes login/publish MFA personally. The local managed session is a
   real credential; this is **not a tokenless first publish**. It never goes to
   CI/agent/artifacts. Do not add `--provenance`, `--provenance=false`, omit the
   file, publish the directory, repack, stage, or use a token fallback on error.
   This first upload creates the real version; no `0.0.0`/staged placeholder is
   needed. Signed handoff success is **not published/registry accepted**.
6. Validate the original bundle and run the unchanged registry crypto/byte check
   with the **actual signing invocation**, not a fabricated CI upload invocation:

   ```sh
   node sdk/scripts/verify-registry.mjs "/absolute/path/to/handoff/review" "/absolute/path/to/registry-evidence" "$SIGNING_RUN_ID" "$SIGNING_RUN_ATTEMPT"
   ```

   Inspect actual registry bytes, signatures, verified provenance and npm UI before
   claiming acceptance. Preserve evidence; never automatically retry publication
   after a downstream failure. Once the package exists, configure the exact npm
   trusted publisher and MFA/disallow-token policy above for subsequent direct
   OIDC releases. Close the enable window afterward. Do not try to publish the
   already-published version again via OIDC.

All checks are point-in-time, not a lock against later source/policy changes or
revocation of a previously issued signature. Pause source changes for the window.
The CI snapshot is not a live variable check; its fresh self-workflow state GET
cannot atomically lock a later npm/Sigstore request. Owner-side live variable
verification also cannot lock the later human Terminal upload. Follow the full
disable/clear/cancel procedure; do not reuse stale verification/approval results.
No-admin-bypass configuration and appropriate main/tag protections must still be
confirmed by the owner; successful fixture tests do not establish those settings.

Signer qualification rejects ambiguous raw JSON **before** Sigstore parsing for
handoffs, and before registry identity acceptance after npm's generic audit.
Only exact v0.3 media types with one `certificate`, or exact legacy v0.2 with one
nonempty `x509CertificateChain`, are accepted. `publicKey` hints, multiple material
fields (even null), content oneof conflicts, malformed certificates and version
suffix tricks are rejected. The same selected leaf is used by crypto and policy;
the real Sigstore identity option is escaped and strictly anchored. SCT/log/
signature checks and normal TUF trust remain mandatory. Unknown future formats
fail closed until separately reviewed; fixtures are never trusted as releases.

## Human review then explicit publication

1. Merge the reviewed distribution source to protected `main`. Manually dispatch
   **SDK release artifact review** (`sdk-release-review.yml`) **on main**, supplying
   the exact stable `sdk/package.json` version, such as `0.1.0`. It has only
   `contents: read`, installs from the lockfile without dependency lifecycle scripts,
   runs tests/pack/installed-consumer checks and uploads a seven-day review bundle.
2. Download the successful run's `lenslayer-agent-sdk-<commit>-<attempt>` artifact.
   Inspect all 18 files, license, exported APIs and dependencies; independently
   verify SHA-256 and npm integrity. Record the **run ID, run attempt, commit SHA,
   version and tarball SHA-256** in your human approval evidence.
3. The release owner creates protected tag **`sdk-v0.1.0`** on that exact commit.
   Do not move a tag to work around a failure. No tags are created by the workflows.
4. Manually dispatch **Publish reviewed SDK** (`sdk-publish.yml`) **on main at the
   same commit**, with default `operation=publish`, `version`, `review_run_id`, the independently verified
   tarball `sha256`, and exact confirmation `publish @lenslayer/agent-sdk@0.1.0`.
   If main advanced since review, the guard intentionally refuses: review again
   at the new main commit before creating its release tag.
5. The non-OIDC verify job checks the successful review workflow identity/event,
   canonical repository, branch, commit, attempt, tag, manifest and actual archive.
   It tests the source and installs/imports/type-checks the **downloaded** tarball.
   Both jobs also query the live main tip and reject a moved main at that check.
   CI requires the necessary enable **snapshot** and freshly enabled self-workflow
   state near the action, not a live variable read. Use the owner close procedure
   to disable/cancel already-started work rather than clearing the flag alone.
   A separate environment-gated publish job repeats the bindings and checks after
   approval. Its only extra permission is `id-token: write`; it installs no
   build dependencies, runs no package lifecycle scripts, and never rebuilds/re-packs.
   Publishing uses empty job-local npm user/global configuration and rejects npm
   token environment variables rather than falling back to stored credentials.
6. Review the environment approval against the recorded values. Approval publishes
   **those exact bytes**, publicly under `latest`, via GitHub-hosted OIDC with
   `--provenance`. All Actions are commit-pinned. Only stable versions are accepted.
7. The post-publish step compares registry SHA-512 integrity and downloaded registry
   bytes' SHA-256 to the review, then installs **the exact registry version** in a
   fresh consumer/cache with lifecycle scripts disabled. It checks the lockfile
   integrity and runs `npm audit signatures --json --include-attestations` for
   cryptographic registry-signature and Sigstore attestation verification. Missing
   or invalid signatures, absent verified provenance, wrong signing-certificate
   workflow identity, or mismatched package/digest/repository/main commit/publish
   workflow/hosted builder fail the job. An advertised attestation alone is not
   accepted. Retained `sdk-registry-evidence/registry-verification.json` records
   the successful audit and lockfile alongside the original bundle for 90 days.
   The owner must inspect this **real** registry evidence and the npm provenance
   UI (including workflow invocation) before claiming acceptance; fixture tests
   do not establish live publication or provenance.

After an authorized publication, the read-only check can be rerun without
republishing (first validate the original reviewed bundle as above):

```sh
node sdk/scripts/verify-registry.mjs /absolute/path/to/review /absolute/path/to/evidence "$SIGNING_OR_PUBLISH_RUN_ID" "$SIGNING_OR_PUBLISH_RUN_ATTEMPT"
```

Main/tag protections, GitHub environment approval and npm publishing policy are
external configuration, not proved by YAML or local tests. Main checks are
point-in-time, not a lock against a subsequent commit. Stop and obtain renewed
review if source or approval evidence changes.

Publication is irreversible as an ordinary retry. If publication succeeded but a
later verification/upload failed, **inspect the registry first**; do not bump or
republish automatically. Re-running a review changes its attempt/artifact and
requires renewed human hash review. Expired/deleted artifacts require a fresh
review. Do not advertise `npm install @lenslayer/agent-sdk` as available until the
coordinator verifies actual publication and provenance. Workflow execution itself
is still an unresolved external acceptance gate.

References (read 2026-10-15): [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/),
[staged publishing](https://docs.npmjs.com/staged-publishing/),
[`npm stage`](https://docs.npmjs.com/cli/v11/commands/npm-stage),
[npm provenance](https://docs.npmjs.com/generating-provenance-statements/),
[registry signature verification](https://docs.npmjs.com/verifying-registry-signatures/).
Detached handoff references: [npm provenance-file](https://docs.npmjs.com/cli/v11/using-npm/config#provenance-file),
[official npm SLSA generation shape](https://github.com/npm/cli/blob/v11.12.1/workspaces/libnpmpublish/lib/provenance.js),
[Sigstore JS attest/verify APIs](https://github.com/sigstore/sigstore-js/tree/main/packages/client),
[Fulcio GitHub identity](https://docs.sigstore.dev/certificate_authority/oidc-in-fulcio/),
[GitHub repository variables](https://docs.github.com/rest/actions/variables#get-a-repository-variable).
Review-fix references: [available workflow token permissions](https://docs.github.com/actions/writing-workflows/workflow-syntax-for-github-actions#permissions),
[official permission list](https://github.com/github/docs/blob/main/data/reusables/actions/github-token-available-permissions.md),
[run-wide environment review history](https://docs.github.com/rest/actions/workflow-runs#get-the-review-history-for-a-workflow-run).
Final-control references: [get workflow (Actions read)](https://docs.github.com/rest/actions/workflows#get-a-workflow),
[disable workflow](https://cli.github.com/manual/gh_workflow_disable),
[cancel/force-cancel run](https://cli.github.com/manual/gh_run_cancel),
[set variable](https://cli.github.com/manual/gh_variable_set),
[Sigstore verification-material oneof](https://github.com/sigstore/protobuf-specs/blob/main/protos/sigstore_bundle.proto).
