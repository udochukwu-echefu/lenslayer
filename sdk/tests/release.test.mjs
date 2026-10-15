import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { checkBundle, checkMetadata, digest, integrity, packageFiles, packageName, repository } from "../scripts/artifact.mjs";
import { checkCurrentMain, checkDispatch, checkReviewRun, selectReviewArtifact } from "../scripts/release-policy.mjs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
const sha = "a".repeat(40), bytes = Buffer.from("synthetic archive bytes");
const env = { GITHUB_REPOSITORY: repository, GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/heads/main", GITHUB_SHA: sha,
  PUBLISH_ENABLED: "true", REVIEW_RUN_ID: "42", EXPECTED_SHA256: digest(bytes), CONFIRMATION: `publish ${packageName}@${pkg.version}` };
const run = { id: 42, repository: { full_name: repository }, head_repository: { full_name: repository }, path: ".github/workflows/sdk-release-review.yml", event: "workflow_dispatch", head_branch: "main", head_sha: sha, status: "completed", conclusion: "success", run_attempt: 2 };

test("release requires a canonical manual main dispatch, explicit version, digest and confirmation", () => {
  checkDispatch(env, pkg.version, true);
  for (const [key, value] of Object.entries({ GITHUB_REPOSITORY: "other/fork", GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/unreviewed", GITHUB_SHA: "short", PUBLISH_ENABLED: "false", REVIEW_RUN_ID: "../42", EXPECTED_SHA256: "not-a-digest", CONFIRMATION: "yes" })) {
    assert.throws(() => checkDispatch({ ...env, [key]: value }, pkg.version, true), key);
  }
  for (const version of ["v0.1.0", "0.1.0-beta.1", "01.1.0", "0.1.0\ncommand"]) assert.throws(() => checkDispatch(env, version));
});

test("release rejects another workflow, source, branch, fork, event, incomplete/failed review or attempt", () => {
  checkReviewRun(run, env);
  for (const [key, value] of Object.entries({ id: 43, path: ".github/workflows/unreviewed.yml", event: "pull_request", head_branch: "feature", head_sha: "b".repeat(40), status: "in_progress", conclusion: "failure", run_attempt: 0, repository: { full_name: "other/fork" }, head_repository: { full_name: "other/fork" } })) {
    assert.throws(() => checkReviewRun({ ...run, [key]: value }, env), key);
  }
});

test("release rechecks the live main tip, not just the dispatch ref name", () => {
  const ref = { ref: "refs/heads/main", object: { type: "commit", sha } };
  checkCurrentMain(ref, env);
  assert.throws(() => checkCurrentMain({ ...ref, ref: "refs/heads/feature" }, env));
  assert.throws(() => checkCurrentMain({ ...ref, object: { type: "commit", sha: "b".repeat(40) } }, env));
  assert.throws(() => checkCurrentMain({ ...ref, object: { type: "tag", sha } }, env));
});

test("review bundle binds SHA-256, npm integrity, contents, version, source and workflow attempt", () => {
  const manifest = { schema: 1, repository, name: packageName, version: pkg.version, sourceSha: sha, sourceDirty: false, sourceRef: "refs/heads/main", runId: "42", runAttempt: "2", filename: `lenslayer-agent-sdk-${pkg.version}.tgz`, sha256: digest(bytes), integrity: integrity(bytes), files: packageFiles };
  const pack = [{ name: packageName, version: pkg.version, filename: manifest.filename, integrity: integrity(bytes), shasum: digest(bytes, "sha1"), files: packageFiles.map((path) => ({ path })) }];
  const expected = { version: pkg.version, sourceSha: sha, sha256: digest(bytes), runId: "42", runAttempt: "2" };
  checkBundle(manifest, pack, bytes, expected);
  assert.throws(() => checkBundle(manifest, pack, Buffer.from("different archive"), expected));
  for (const [key, value] of Object.entries({ repository: "other/fork", version: "9.9.9", sourceSha: "b".repeat(40), sourceDirty: true, sourceRef: "refs/heads/feature", runId: "43", runAttempt: "1", filename: "../escape.tgz", sha256: "b".repeat(64), integrity: "sha512-other", files: [...packageFiles, "source.txt"] })) {
    assert.throws(() => checkBundle({ ...manifest, [key]: value }, pack, bytes, expected), key);
  }
  assert.throws(() => checkBundle(manifest, [{ ...pack[0], integrity: "sha512-other" }], bytes, expected));
  assert.throws(() => checkBundle(manifest, [{ ...pack[0], files: pack[0].files.slice(1) }], bytes, expected));
});

test("artifact selection refuses expired, ambiguous, different-attempt or different-source bundles", () => {
  const artifact = { id: 123, name: `lenslayer-agent-sdk-${sha}-2`, expired: false, workflow_run: { head_sha: sha } };
  assert.equal(selectReviewArtifact([artifact], env, 2), 123);
  assert.throws(() => selectReviewArtifact([], env, 2));
  assert.throws(() => selectReviewArtifact([artifact, artifact], env, 2));
  assert.throws(() => selectReviewArtifact([artifact], env, 1));
  assert.throws(() => selectReviewArtifact([{ ...artifact, expired: true }], env, 2));
  assert.throws(() => selectReviewArtifact([{ ...artifact, workflow_run: { head_sha: "b".repeat(40) } }], env, 2));
});

test("SDK metadata is MIT, exact-file-allowlisted and runtime-dependency-free; lockfile agrees", () => {
  checkMetadata(pkg, pkg.version);
  const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url)));
  assert.equal(lock.packages[""].license, "MIT");
  assert.equal(lock.version, pkg.version);
  assert.deepEqual(lock.packages[""].devDependencies, pkg.devDependencies);
  assert.match(pkg.devDependencies.typescript, /^\d+\.\d+\.\d+$/);
  assert.equal(pkg.devDependencies.sigstore, "4.1.1");
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (path) assert.equal(entry.dev, true, `${path} must remain development-only`);
  }
  assert.throws(() => checkMetadata({ ...pkg, files: [...pkg.files, "dist/unreviewed.js"] }, pkg.version));
  assert.throws(() => checkMetadata({ ...pkg, license: "UNLICENSED" }, pkg.version));
});

test("SDK workflow source retains manual main review, environment approval, exact-byte OIDC publish and crypto check", () => {
  // Source regression guards, not proof of configured environment protection or
  // successful Actions/OIDC execution. Those require owner inspection/live runs.
  const review = readFileSync(new URL("../../.github/workflows/sdk-release-review.yml", import.meta.url), "utf8");
  const publish = readFileSync(new URL("../../.github/workflows/sdk-publish.yml", import.meta.url), "utf8");
  for (const workflow of [review, publish]) {
    assert.match(workflow, /workflow_dispatch:/);
    assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
    assert.match(workflow, /persist-credentials: false/);
    assert.match(workflow, /package-manager-cache: false/);
    for (const [, action] of workflow.matchAll(/uses: (\S+)/g)) assert.match(action, /^actions\/[\w-]+@[a-f0-9]{40}$/);
  }
  assert.doesNotMatch(review, /id-token:|npm publish|secrets\./);
  const privileged = publish.split("\n  publish:\n")[1].split("\n  detached-provenance:\n")[0];
  assert.ok(privileged);
  assert.match(privileged, /environment: sdk-npm/);
  assert.match(privileged, /id-token: write/);
  assert.match(privileged, /node sdk\/scripts\/release-policy\.mjs github publish/);
  assert.match(privileged, /node sdk\/scripts\/release-artifact\.mjs verify sdk-release-review/);
  assert.match(privileged, /npm publish "sdk-release-review\/lenslayer-agent-sdk-\$\{EXPECTED_VERSION\}\.tgz" --ignore-scripts --access public --provenance/);
  assert.match(privileged, /test "\$\(npm --version\)" = '11\.12\.1'/);
  assert.match(privileged, /test -z "\$\{NODE_AUTH_TOKEN:-\}"/);
  assert.match(privileged, /test -z "\$\{NPM_TOKEN:-\}"/);
  assert.match(privileged, /test -z "\$\{NPM_ID_TOKEN:-\}"/);
  assert.match(privileged, /test -z "\$\{SIGSTORE_ID_TOKEN:-\}"/);
  assert.match(privileged, /--userconfig "\$RUNNER_TEMP\/sdk-publish-user\.npmrc" --globalconfig/);
  assert.match(privileged, /node sdk\/scripts\/verify-registry\.mjs sdk-release-review sdk-registry-evidence/);
  assert.doesNotMatch(privileged, /npm (?:ci|install|pack)|release-artifact\.mjs pack|secrets\./);
});

test("detached operation is explicit and does not change default OIDC or confirmation", () => {
  checkDispatch({ ...env, RELEASE_OPERATION: "publish" }, pkg.version, true);
  const detached = { ...env, GITHUB_RUN_ATTEMPT: "1", RELEASE_OPERATION: "detached-provenance", CONFIRMATION: `sign ${packageName}@${pkg.version}` };
  checkDispatch(detached, pkg.version, true);
  assert.throws(() => checkDispatch({ ...detached, CONFIRMATION: env.CONFIRMATION }, pkg.version, true));
  assert.throws(() => checkDispatch({ ...env, RELEASE_OPERATION: "fallback" }, pkg.version, true));
  assert.throws(() => checkDispatch({ ...detached, PUBLISH_ENABLED: "false" }, pkg.version, true));
  assert.throws(() => checkDispatch({ ...detached, GITHUB_RUN_ATTEMPT: "2" }, pkg.version, true), /attempt 1/);
  assert.throws(() => checkMetadata({ ...pkg, publishConfig: { ...pkg.publishConfig, provenance: false } }, pkg.version));
  assert.throws(() => checkMetadata({ ...pkg, publishConfig: { ...pkg.publishConfig, provenance: true } }, pkg.version));
  const workflow = readFileSync(new URL("../../.github/workflows/sdk-publish.yml", import.meta.url), "utf8");
  assert.match(workflow, /default: publish/);
  assert.match(workflow, /if: inputs\.operation == 'publish'/);
  const sign = workflow.split("\n  detached-provenance:\n")[1];
  for (const pattern of [/if: inputs\.operation == 'detached-provenance'/, /needs: verify/, /environment: sdk-npm/,
    /id-token: write/, /release-policy\.mjs github publish/, /release-artifact\.mjs verify/, /sign-handoff\.mjs/,
    /npm --prefix sdk ci --ignore-scripts/, /sdk-bootstrap-\$\{\{ inputs.version \}\}/]) assert.match(sign, pattern);
  assert.doesNotMatch(sign, /npm (?:publish|stage)|release-artifact\.mjs pack|secrets\.|continue-on-error/);
  assert.equal(pkg.publishConfig.provenance, undefined);
  assert.match(pkg.scripts.prepublishOnly, /^node scripts\/release-intent\.mjs &&/);
});

test("both final external-action boundaries freshly recheck policy with the original downloaded review binding", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/sdk-publish.yml", import.meta.url), "utf8");
  const direct = workflow.split("      - name: Publish exact reviewed bytes")[1].split("      - name: Verify registry bytes")[0];
  assert.match(direct, /node sdk\/scripts\/release-policy\.mjs github publish\s+ npm publish/);
  for (const key of ["GH_TOKEN", "REVIEW_RUN_ATTEMPT", "REVIEW_ARTIFACT_ID"]) assert.match(direct, new RegExp(`${key}:`));
  const sign = workflow.split("      - name: Sign and cryptographically verify")[1].split("      - name: Retain signed handoff")[0];
  for (const key of ["GH_TOKEN", "REVIEW_RUN_ATTEMPT", "REVIEW_ARTIFACT_ID"]) assert.match(sign, new RegExp(`${key}:`));
  const helper = readFileSync(new URL("../scripts/sign-handoff.mjs", import.meta.url), "utf8");
  assert.match(helper, /await checkReleaseBoundary\(env\);\s+const bundle = await attest/);
  assert.doesNotMatch(workflow, /variables: read|secrets\./);
});
