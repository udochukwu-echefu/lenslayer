# SDK release preflight — read-only preparation

`scripts/release-preflight.mjs` never packs, signs, authenticates to npm or
publishes. It reads local bundles/Git state and fixed canonical GitHub GET
resources through the owner's existing managed `gh` session. No token extraction,
App/PAT fallback, new permission or offline CLI acceptance option exists.

## Coordinator reads now

Run these read-only commands in the approved coordinator session, not by exporting
credentials to this isolated agent. Save results with observation times. The
supplied historical boundary is c926f1968bbffc48d27c1231554acf40a9aa9472 /
CI 38729026621 success / PR #5 draft and open. It does not qualify this new delta.

```sh
gh pr view 5 --repo udochukwu-echefu/lenslayer --json state,isDraft,headRefOid,baseRefName,mergeStateStatus,reviewDecision,statusCheckRollup,url
gh run view 38729026621 --repo udochukwu-echefu/lenslayer --json headSha,status,conclusion,url
gh api --hostname github.com --method GET repos/udochukwu-echefu/lenslayer/git/ref/heads/main
gh api --hostname github.com --method GET repos/udochukwu-echefu/lenslayer/branches/main/protection
gh api --hostname github.com --method GET repos/udochukwu-echefu/lenslayer/environments/sdk-npm
gh api --hostname github.com --method GET 'repos/udochukwu-echefu/lenslayer/environments/sdk-npm/deployment-branch-policies?per_page=100'
gh api --hostname github.com --method GET repos/udochukwu-echefu/lenslayer/actions/workflows/sdk-release-review.yml
gh api --hostname github.com --method GET repos/udochukwu-echefu/lenslayer/actions/workflows/sdk-publish.yml
gh api --hostname github.com --method GET repos/udochukwu-echefu/lenslayer/actions/variables/SDK_NPM_PUBLISH_ENABLED
gh api --hostname github.com --method GET --paginate 'repos/udochukwu-echefu/lenslayer/actions/workflows/sdk-release-review.yml/runs?event=workflow_dispatch&branch=main&per_page=100'
gh api --hostname github.com --method GET --paginate 'repos/udochukwu-echefu/lenslayer/actions/workflows/sdk-publish.yml/runs?per_page=100' --jq '.workflow_runs[] | {id,run_attempt,head_sha,status,conclusion}'
gh api --hostname github.com --method GET --paginate 'repos/udochukwu-echefu/lenslayer/rulesets?includes_parents=true&per_page=100'
```

The flag's 404 is a closed window, not permission to create it or substitute
credentials. Any other unreadable required policy is also a stop. Inspect the
applicable tag ruleset detail with `gh api --hostname github.com --method GET
repos/udochukwu-echefu/lenslayer/rulesets/<ACTUAL_RULESET_ID>`; main protection
alone does not protect `sdk-v*` creation/update/deletion.

The coordinator reports main protection **approved/applied**: PR required, strict
test check, admins included, no force push/deletion. Reconfirm that exact live
policy; do not recreate or widen it. Reconfirm `sdk-npm` owner reviewer, main-only
branch policy and **`can_admins_bypass: false`**. The verifier now enforces the
last condition as a boolean, not an absent/default truthiness assumption.
Preflight does not certify branch/tag rules or npm account/MFA settings; retain
their separate owner review. No live settings were queried by this implementation.

## After approved merge and real artifact review

First integrate/review this delta and obtain new canonical CI. The real workflow
is **`sdk-release-review.yml`**, not `sdk-review.yml`. Only the owner/coordinator
may authorize its dispatch on final main. No dispatch is performed by preflight.

Record fresh `MAIN_SHA`, `REVIEW_RUN_ID`, current `REVIEW_RUN_ATTEMPT`, and download
the successful run's artifact into a new directory outside the source checkout:

```sh
gh run view "$REVIEW_RUN_ID" --repo udochukwu-echefu/lenslayer --json headSha,attempt,status,conclusion,url
gh api --hostname github.com --method GET "repos/udochukwu-echefu/lenslayer/actions/runs/$REVIEW_RUN_ID/artifacts?per_page=100"
gh run download "$REVIEW_RUN_ID" --repo udochukwu-echefu/lenslayer --name "lenslayer-agent-sdk-${MAIN_SHA}-${REVIEW_RUN_ATTEMPT}" --dir "$REVIEW_DIR"
```

Use absolute `REVIEW_DIR` and `EVIDENCE_DIR` paths; use a separate evidence directory
so the four-file review allowlist stays intact. Independently inspect all 18 SDK
files, MIT/license, metadata and APIs. Compute/approve `TARBALL_SHA256` and SHA-512
SRI from the **downloaded tarball**, not just `review.json`. Do not run `npm pack`
or substitute the earlier 4.1.0/4.1.1 local test archive.

From a clean checkout of **that exact main commit**, including this reviewed tool:

```sh
node sdk/scripts/release-preflight.mjs review "$REVIEW_DIR" 0.1.0 "$TARBALL_SHA256" "$REVIEW_RUN_ID" "$REVIEW_RUN_ATTEMPT" "$MAIN_SHA" > "$EVIDENCE_DIR/review-preflight.json"
```

This binds the supplied main SHA, approved hash, canonical successful public-main
workflow run and current attempt, latest review dispatch, one unexpired artifact
and all four original file hashes. It repeats metadata/local/source checks and
rejects dirty/untracked release source, missing Git HEAD, superseded attempts,
newer review dispatches (even failed), unavailable metadata, malformed/missing ZIP
digest or expired/incomplete artifact listings. It does **not** enable release.

The JSON separates `sha256` (actual tarball) and `integrity` (actual SHA-512 SRI)
from `githubZipDigest` (GitHub-reported artifact ZIP hash). The ZIP hash is not
locally verified by this tool: it receives extracted files, not the ZIP. Do not
claim otherwise. Independent tarball hash approval is mandatory.

## After separately approved real detached signing

Follow [DISTRIBUTION.md](DISTRIBUTION.md) for protected tag creation, public
signing/log disclosure authorization, release-window opening and **fresh attempt-1**
dispatch/environment approval. These are owner writes, not preflight operations.
Download the successful `sdk-bootstrap-<version>-<SHA>-<run>-1` artifact separately.
Never rerun signing or reuse approval history after an uncertain result.

Install only the exact SDK lockfile with `npm ci --ignore-scripts --no-audit
--no-fund`, using private npm config/cache as appropriate and no global install.
Then, with absolute `HANDOFF_DIR` and unchanged source/review bytes:

```sh
node sdk/scripts/release-preflight.mjs bootstrap "$REVIEW_DIR" "$HANDOFF_DIR" 0.1.0 "$TARBALL_SHA256" "$REVIEW_RUN_ID" "$REVIEW_RUN_ATTEMPT" "$SIGNING_RUN_ID" 1 "$MAIN_SHA" > "$EVIDENCE_DIR/bootstrap-preflight.json"
```

This requires all four handoff review files to hash-identically match the
**separately kept original review**, then invokes the real existing verifier:
fresh TUF, Sigstore crypto/exact identity/source/invocation, 24-hour lifetime,
current signing/review runs/artifacts, latest dispatches, live enable/workflow,
peeled tag and actual owner approval/environment policy. Local fixture success
cannot produce a CLI release approval. No real handoff exists in this isolated copy.

Only success emits `ownerTerminalCommand`: an exact, shell-quoted one-shot block
using verified absolute paths, Node 24.15.0/npm 11.12.1, a fresh `bootstrap-check`,
owner `npm login --auth-type=web`, another fresh `bootstrap-check` **after** login/
MFA delay, and `npm publish <original.tgz> --provenance-file=<verified.bundle>
--ignore-scripts --access public --tag latest --registry=https://registry.npmjs.org/`.
`bootstrap-check` performs the same verification without emitting a nested command.
The tool prints the block as JSON; it never runs it. The owner must review it and
personally execute it in their own Terminal, completing MFA. Do not pipe it to a
shell, automate credential entry, use a token fallback, add `--provenance`, publish
a directory or repack. There is deliberately no guessed executable owner command
before the real paths, source, hash and signature have passed verification.

All checks are point-in-time, not a lock. Freeze main/source/policies during the
window; abandon stale reports. No bypass flag exists. Disable/clear/cancel/check
terminality and inspect external effects to close a window, as the distribution
guide requires; changing a variable alone does not revoke admitted work.

After the one authorized owner upload, run the unchanged read-only registry check
with the **actual signing invocation** and preserve its evidence plus npm UI:

```sh
node sdk/scripts/verify-registry.mjs "$HANDOFF_DIR/review" "$EVIDENCE_DIR/registry" "$SIGNING_RUN_ID" 1
```

A failed post-upload check never authorizes republishing, bumping, unpublishing or
re-signing. Inspect registry state first. Package-scoped npm trust is configured
by the owner only after the first real package exists; direct OIDC cannot
bootstrap its own trust. Signing, managed API/TUF acceptance, first npm upload,
registry bytes/signatures/provenance and package UI remain external gates.
