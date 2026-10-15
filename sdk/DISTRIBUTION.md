# SDK distribution — prepared, not published

Only `@lenslayer/agent-sdk` is MIT licensed (2026 LensLayer). The repository,
backend and private MCP adapter have **not** been relicensed. Version 0.1.0 is
still unpublished. No release workflow, SDK registry crypto/provenance verification,
OIDC exchange or host/provider acceptance has been exercised by this source audit.

Owner-provided status (2026-10-15): the free **`@lenslayer` npm organization
exists**, owner `udochukwuchibueze`, one member, zero packages; MFA is disabled.
PR #5 is still draft/unmerged. This audit did not query account settings. Scope
creation is no longer a blocker; **MFA, canonical main/source/artifact owner review,
bootstrap, trusted publisher configuration and real registry verification remain
blockers**. Leave `SDK_NPM_PUBLISH_ENABLED` unset.

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
   Independent required reviewers, self-review prevention and disabling admin
   bypass are available stronger protections, not an assumed user requirement.
4. In npm package trusted publishers, bind **only** this package to GitHub owner
   `udochukwu-echefu`, repository `lenslayer`, workflow filename `sdk-publish.yml`,
   environment `sdk-npm`. Enable direct `npm publish`, not dist-tag management.
   Use 2FA and disallow token-based publishing. No PAT, npm token or
   `NODE_AUTH_TOKEN` secret is required or accepted by this workflow.
5. Resolve first-package bootstrap as a **separate owner-approved operation**;
   see below. This direct-publish workflow cannot create a preconfigured trust
   relationship for a nonexistent package and has no token/manual-publish fallback.
   New trusted-publisher configurations currently expire if unused for two days;
   coordinate setup and approval accordingly.
6. Only then set repository variable **`SDK_NPM_PUBLISH_ENABLED=true`**. Leave it
   unset otherwise. The workflow fails closed unless it is exactly `true`.

### First-package bootstrap is not implemented or authorized here

Official npm docs distinguish **ordinary OIDC publishing: npm >=11.5.1** from
**staged publishing: npm >=11.15.0** (both require Node >=22.14.0). The pinned
Node 24.15.0 / npm 11.12.1 workflow supports the former, **not** `npm stage`.
Do not simply replace `npm publish` with `npm stage publish` on that toolchain.
The current workflow intentionally stays direct-publish only; a staging workflow
would need a separately reviewed npm pin, stage-result handling and approval flow.

npm now documents staging a new package: it creates a **public `0.0.0-stage`
placeholder**, while the submitted version/contents stay private until a
maintainer approves with 2FA. Staging itself is a registry mutation, not a dry run.
The initial authorization/trust setup for this zero-package organization has not
been exercised. The owner must resolve that chicken-and-egg step with npm's
supported process (or npm support); no token fallback is added to CI here.

Any separately approved bootstrap plan must use **only the exact downloaded,
owner-reviewed main CI tarball**, not `npm stage publish` with no package argument
(which packs the current directory), a dirty/local bundle or a repack. Record
the run/attempt/commit/hash and verify the staged download matches before any
2FA approval. Do not disable provenance to force a local bootstrap through: a
local staged upload does not establish GitHub provenance. If a placeholder is
needed to configure trust, its creation, treatment of the pending staged version,
and a subsequent provenance-bearing OIDC release need explicit owner decisions.
Do not approve an unprovenanced bootstrap as the SDK release. This unresolved
bootstrap plan is a release blocker, not a claim that the workflow can bootstrap.

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
   same commit**, with `version`, `review_run_id`, the independently verified
   tarball `sha256`, and exact confirmation `publish @lenslayer/agent-sdk@0.1.0`.
   If main advanced since review, the guard intentionally refuses: review again
   at the new main commit before creating its release tag.
5. The non-OIDC verify job checks the successful review workflow identity/event,
   canonical repository, branch, commit, attempt, tag, manifest and actual archive.
   It tests the source and installs/imports/type-checks the **downloaded** tarball.
   Both jobs also query the live main tip and reject a moved main at that check.
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
node sdk/scripts/verify-registry.mjs /absolute/path/to/review /absolute/path/to/evidence
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
