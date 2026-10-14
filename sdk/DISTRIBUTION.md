# SDK distribution — prepared, not published

Only `@lenslayer/agent-sdk` is MIT licensed (2026 LensLayer). The repository,
backend and private MCP adapter have **not** been relicensed. Version 0.1.0 is
still unpublished. No workflow, registry access, OIDC exchange or host/provider
acceptance has been exercised by this source-only implementation.

This guide supersedes older **SDK distribution** instructions that describe
`UNLICENSED`. Existing release/roadmap records are left unchanged intentionally.

## Local verification

With Node 24.15.0 / npm 11.12.1, from the checkout root:

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

1. Confirm `@lenslayer` scope ownership, intended maintainers, public package and
   public canonical repository `udochukwu-echefu/lenslayer`; review the version and
   source, including SDK changelog accuracy. The MCP package remains private.
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
5. If npm cannot configure a trusted publisher before the first package exists,
   stop and resolve the registry's supported bootstrap process as a separate
   owner-approved operation. This workflow has no token/manual-publish fallback.
   New trusted-publisher configurations currently expire if unused for two days;
   coordinate setup and approval accordingly.
6. Only then set repository variable **`SDK_NPM_PUBLISH_ENABLED=true`**. Leave it
   unset otherwise. The workflow fails closed unless it is exactly `true`.

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
   A separate environment-gated publish job repeats the bindings and checks after
   approval. Its only extra permission is `id-token: write`; it installs no
   dependencies, runs no package lifecycle scripts, and never rebuilds/re-packs.
6. Review the environment approval against the recorded values. Approval publishes
   **those exact bytes**, publicly under `latest`, via GitHub-hosted OIDC with
   `--provenance`. All Actions are commit-pinned. Only stable versions are accepted.
7. The post-publish step compares registry SHA-512 integrity and downloaded registry
   bytes' SHA-256 to the review, and requires an advertised provenance attestation.
   It does not itself cryptographically verify the attestation. Independently
   inspect npm provenance (source repository/commit and publish workflow) and use
   `npm audit signatures` in a clean registry-installed consumer before claiming
   release acceptance. The published-byte review bundle is retained for 90 days.

Publication is irreversible as an ordinary retry. If publication succeeded but a
later verification/upload failed, **inspect the registry first**; do not bump or
republish automatically. Re-running a review changes its attempt/artifact and
requires renewed human hash review. Expired/deleted artifacts require a fresh
review. Do not advertise `npm install @lenslayer/agent-sdk` as available until the
coordinator verifies actual publication and provenance. Workflow execution itself
is still an unresolved external acceptance gate.

References (read 2026-10-14): [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/),
[npm provenance](https://docs.npmjs.com/generating-provenance-statements/).
