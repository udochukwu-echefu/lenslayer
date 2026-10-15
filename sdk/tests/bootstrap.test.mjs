import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bootstrapFixture } from "./bootstrap-fixtures.mjs";
import { readHandoff, checkHandoff, handoffLifetimeMs, makeHandoff } from "../scripts/handoff.mjs";
import { checkLiveHandoff, checkSigningRun, githubGet } from "../scripts/github-read.mjs";
import { verifyHandoff } from "../scripts/verify-handoff.mjs";
import { checkSigningContext } from "../scripts/sign-handoff.mjs";

async function fixture(run) {
  const f = bootstrapFixture();
  try { await run(f); } finally { rmSync(f.root, { recursive: true, force: true }); }
}

test("handoff verifies actual local DSSE fixture signatures plus exact archive, signed metadata and live-policy fixtures", () => fixture(async (f) => {
  const before = readFileSync(join(f.reviewDir, f.review.filename));
  const result = await verifyHandoff(f.directory, f.expected, { get: f.get, verifySignature: f.cryptoVerify });
  assert.equal(result.sha256, f.review.sha256);
  assert.equal(result.signingRunId, "99");
  assert.equal(result.signingRunAttempt, "1");
  assert.equal(result.artifactId, 456);
  assert.deepEqual(readFileSync(join(f.reviewDir, f.review.filename)), before);
  // This callback verifies real RSA/DSSE signatures against one isolated test
  // certificate. It is NOT Fulcio/TUF/Rekor or real registry acceptance.
}));

test("tampered actual signature/payload fails before any GitHub request even when sidecar checksums are recomputed", () => fixture(async (f) => {
  const good = structuredClone(f.bundle);
  const mutations = [
    (b) => { b.dsseEnvelope.signatures[0].sig = Buffer.alloc(256).toString("base64"); },
    (b) => { b.dsseEnvelope.payload = Buffer.from('{}').toString("base64"); },
    (b) => { b.dsseEnvelope.signatures = []; },
    (b) => { b.verificationMaterial.tlogEntries = []; },
    (b) => { b.verificationMaterial.certificate.rawBytes = "not-a-certificate"; },
    (b) => { b.dsseEnvelope.payloadType = "text/plain"; },
  ];
  for (const mutate of mutations) {
    Object.assign(f.bundle, structuredClone(good));
    mutate(f.bundle); f.save();
    let gets = 0;
    await assert.rejects(verifyHandoff(f.directory, f.expected, { verifySignature: f.cryptoVerify, get: async () => { gets++; throw Error("No network expected"); } }));
    assert.equal(gets, 0);
  }
}));

test("correctly signed fixture with wrong subject, source, workflow, builder, invocation or handoff binding fails policy", () => fixture(async (f) => {
  const good = structuredClone(f.bundle);
  const mutations = [
    (s) => { s.subject[0].name = "pkg:npm/other@0.1.0"; },
    (s) => { s.subject[0].digest.sha512 = "0".repeat(128); },
    (s) => { s.subject.push(s.subject[0]); },
    (s) => { s.predicateType = "other"; },
    (s) => { s.predicate.buildDefinition.externalParameters.workflow.path = ".github/workflows/other.yml"; },
    (s) => { s.predicate.buildDefinition.externalParameters.workflow.ref = "refs/tags/sdk-v0.1.0"; },
    (s) => { s.predicate.buildDefinition.externalParameters.workflow.repository = "https://github.com/other/fork"; },
    (s) => { s.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit = "b".repeat(40); },
    (s) => { s.predicate.buildDefinition.internalParameters.github.event_name = "pull_request"; },
    (s) => { s.predicate.runDetails.builder.id = "self-hosted"; },
    (s) => { s.predicate.runDetails.metadata.invocationId = "https://github.com/udochukwu-echefu/lenslayer/actions/runs/100/attempts/1"; },
    (s) => { s.predicate.runDetails.metadata.invocationId = "https://github.com/udochukwu-echefu/lenslayer/actions/runs/99/attempts/2"; },
    (s) => { s.predicate.buildDefinition.internalParameters.lenslayer.reviewArtifactId = "999"; },
    (s) => { s.predicate.buildDefinition.internalParameters.lenslayer.publishEnabled = false; },
    (s) => { delete s.predicate.buildDefinition.internalParameters.lenslayer; },
  ];
  for (const mutate of mutations) {
    Object.assign(f.bundle, structuredClone(good));
    f.resign(mutate);
    await assert.rejects(verifyHandoff(f.directory, f.expected, { get: f.get, verifySignature: f.cryptoVerify }));
  }
}));

test("missing, malformed, symlinked, wrong-byte and unsigned sidecar handoffs fail closed", () => fixture(async (f) => {
  assert.throws(() => readHandoff(f.directory, { ...f.expected, sha256: "b".repeat(64) }));
  assert.throws(() => readHandoff(f.directory, { ...f.expected, version: "9.0.0" }));
  assert.throws(() => readHandoff(f.directory, { ...f.expected, runAttempt: "2" }));
  writeFileSync(join(f.directory, "extra.txt"), "extra");
  assert.throws(() => readHandoff(f.directory, f.expected));
  rmSync(join(f.directory, "extra.txt"));
  f.h.reviewArtifactId = "999"; f.save();
  await assert.rejects(verifyHandoff(f.directory, f.expected, { get: f.get, verifySignature: f.cryptoVerify }), /must be signed/);
  f.h.reviewArtifactId = "123"; f.save();
  writeFileSync(join(f.directory, "provenance.sigstore.json"), "{");
  assert.throws(() => readHandoff(f.directory, f.expected));
  f.save();
  const original = readFileSync(join(f.reviewDir, f.review.filename));
  writeFileSync(join(f.reviewDir, f.review.filename), "different bytes");
  assert.throws(() => readHandoff(f.directory, f.expected));
  writeFileSync(join(f.reviewDir, f.review.filename), original);
  rmSync(join(f.directory, "provenance.sigstore.json"));
  assert.throws(() => readHandoff(f.directory, f.expected));
  symlinkSync(join(f.reviewDir, "review.json"), join(f.directory, "provenance.sigstore.json"));
  assert.throws(() => readHandoff(f.directory, f.expected), /symlinks/);
}));

test("expired and future-dated handoffs cannot extend the 24-hour approval lifetime", () => fixture(async (f) => {
  const issued = Date.parse(f.h.createdAt);
  assert.throws(() => checkHandoff(f.h, f.review, f.expected, issued + handoffLifetimeMs), /expired/);
  assert.throws(() => checkHandoff(f.h, f.review, f.expected, issued - 6 * 60 * 1000), /future/);
  assert.throws(() => checkHandoff({ ...f.h, expiresAt: new Date(issued + 2 * handoffLifetimeMs).toISOString() }, f.review, f.expected));
}));

test("actual REST-policy bindings reject moved main/tag, disabled enable, wrong/failed/superseded runs, artifacts and approvals", () => fixture(async (f) => {
  const original = structuredClone(f.metadata);
  const mutations = [
    (m) => { m["git/ref/heads/main"].object.sha = "b".repeat(40); },
    (m) => { m["actions/variables/SDK_NPM_PUBLISH_ENABLED"].value = "false"; },
    (m) => { m["actions/workflows/sdk-publish.yml"].state = "disabled_manually"; },
    (m) => { m["actions/workflows/sdk-publish.yml"].path = ".github/workflows/other.yml"; },
    (m) => { m["actions/runs/99"].head_repository.full_name = "other/fork"; },
    (m) => { m["actions/runs/99"].repository.private = true; },
    (m) => { m["actions/runs/99"].path = ".github/workflows/other.yml"; },
    (m) => { m["actions/runs/99"].head_branch = "feature"; },
    (m) => { m["actions/runs/99"].event = "push"; },
    (m) => { m["actions/runs/99"].head_sha = "b".repeat(40); },
    (m) => { m["actions/runs/99"].status = "in_progress"; },
    (m) => { m["actions/runs/99"].conclusion = "failure"; },
    (m) => { m["actions/runs/99"].run_attempt = 2; },
    (m) => { m["actions/runs/99"].run_started_at = new Date(Date.parse(f.h.createdAt) + 1000).toISOString(); },
    (m) => { m["actions/runs/42"].run_attempt = 3; },
    (m) => { m["actions/runs/42"].conclusion = "failure"; },
    (m) => { m["actions/runs/42/artifacts?per_page=100"].artifacts[0].expired = true; },
    (m) => { m["actions/runs/42/artifacts?per_page=100"].total_count = 101; },
    (m) => { m["actions/runs/42/artifacts?per_page=100"].artifacts[0].id = 999; },
    (m) => { m["actions/runs/99/artifacts?per_page=100"].artifacts[0].expired = true; },
    (m) => { m["actions/runs/99/artifacts?per_page=100"].artifacts[0].name = "other-attempt"; },
    (m) => { m["actions/workflows/sdk-publish.yml/runs?event=workflow_dispatch&branch=main&per_page=100"].workflow_runs[0].id = 100; },
    (m) => { m["actions/workflows/sdk-release-review.yml/runs?event=workflow_dispatch&branch=main&per_page=100"].workflow_runs[0].id = 43; },
    (m) => { m["actions/runs/99/approvals"][0].state = "rejected"; },
    (m) => { m["actions/runs/99/approvals"][0].user.login = "not-owner"; },
    (m) => { m["environments/sdk-npm"].protection_rules = []; },
    (m) => { m["environments/sdk-npm"].deployment_branch_policy = null; },
    (m) => { m["environments/sdk-npm/deployment-branch-policies?per_page=100"].branch_policies[0].name = "*"; },
    (m) => { m[`git/ref/tags/sdk-v${f.review.version}`].object.sha = "b".repeat(40); },
  ];
  for (const mutate of mutations) {
    for (const key of Object.keys(f.metadata)) delete f.metadata[key];
    Object.assign(f.metadata, structuredClone(original));
    mutate(f.metadata);
    await assert.rejects(checkLiveHandoff(f.h, f.review, f.get));
  }
  await assert.rejects(checkLiveHandoff(f.h, f.review, async () => { throw Error("Authentication or network unavailable"); }));
}));

test("annotated release tags are peeled through fixed canonical resources with bounded depth", () => fixture(async (f) => {
  const tagSha = "c".repeat(40);
  f.metadata[`git/ref/tags/sdk-v${f.review.version}`].object = { type: "tag", sha: tagSha };
  f.metadata[`git/tags/${tagSha}`] = { sha: tagSha, object: { type: "commit", sha: f.review.sourceSha } };
  await checkLiveHandoff(f.h, f.review, f.get);
  f.metadata[`git/tags/${tagSha}`].object = { type: "tag", sha: tagSha };
  await assert.rejects(checkLiveHandoff(f.h, f.review, f.get));
}));

test("a matching signing rerun cannot reuse run-wide attempt-1 owner approval, even with a newly signed attempt-2 handoff", () => fixture(async (f) => {
  const approvals = structuredClone(f.metadata["actions/runs/99/approvals"]);
  // The independent-review hostile case: both run and handoff now say attempt 2,
  // but the unchanged owner approval actually came from attempt 1.
  f.h.signingRunAttempt = "2";
  f.metadata["actions/runs/99"].run_attempt = 2;
  f.metadata["actions/runs/99/artifacts?per_page=100"].artifacts[0].name = `sdk-bootstrap-${f.review.version}-${f.review.sourceSha}-99-2`;
  f.resign((s) => {
    s.predicate.runDetails.metadata.invocationId = "https://github.com/udochukwu-echefu/lenslayer/actions/runs/99/attempts/2";
    s.predicate.buildDefinition.internalParameters.lenslayer = structuredClone(f.h);
  });
  assert.deepEqual(f.metadata["actions/runs/99/approvals"], approvals);
  assert.throws(() => checkSigningRun(f.metadata["actions/runs/99"], f.h), /attempt-1/);
  await assert.rejects(checkLiveHandoff(f.h, f.review, f.get), /attempt-1/);
  await assert.rejects(verifyHandoff(f.directory, { ...f.expected, runAttempt: "2" }, { get: f.get, verifySignature: f.cryptoVerify }), /attempt-1/);
  assert.throws(() => makeHandoff(f.review, { runId: "99", runAttempt: "2", reviewArtifactId: "123" }), /attempt-1/);
}));

test("rerunning a signing workflow during owner metadata inspection invalidates its first-attempt handoff", () => fixture(async (f) => {
  let reads = 0;
  const get = async (path) => {
    const value = await f.get(path);
    if (path === "actions/runs/99" && ++reads > 1) value.run_attempt = 2;
    return value;
  };
  await assert.rejects(checkLiveHandoff(f.h, f.review, get), /rerun/);
  assert.equal(reads, 2);
}));

test("owner gh boundary is fixed canonical GET only, no shell, auth values or alternate API paths", () => {
  const value = githubGet("actions/variables/SDK_NPM_PUBLISH_ENABLED", (command, args, options) => {
    assert.equal(command, "gh");
    assert.deepEqual(args.slice(0, 5), ["api", "--hostname", "github.com", "--method", "GET"]);
    assert.equal(args.at(-1), "repos/udochukwu-echefu/lenslayer/actions/variables/SDK_NPM_PUBLISH_ENABLED");
    assert.equal(options.shell, undefined);
    return '{"name":"SDK_NPM_PUBLISH_ENABLED","value":"true"}';
  });
  assert.equal(value.value, "true");
  for (const resource of ["../other", "https://evil.example/", "actions/runs/1;echo bad", "actions/secrets", "git/ref/heads/main?token=x"])
    assert.throws(() => githubGet(resource, () => { throw Error("Must not execute"); }));
});

test("owner metadata path runs an actual sanitized gh CLI subprocess stub with no auth store or network", () => fixture(async (f) => {
  const bin = join(f.root, "bin");
  mkdirSync(bin);
  const metadataFile = join(f.root, "metadata.json");
  writeFileSync(metadataFile, JSON.stringify(f.metadata));
  const shim = join(bin, "gh");
  writeFileSync(shim, `#!${process.execPath}\nconst fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] !== 'api' || args[1] !== '--hostname' || args[2] !== 'github.com' || args[3] !== '--method' || args[4] !== 'GET') process.exit(2);
const prefix = 'repos/udochukwu-echefu/lenslayer/';
const path = args.at(-1); if (!path.startsWith(prefix)) process.exit(3);
const data = JSON.parse(fs.readFileSync(${JSON.stringify(metadataFile)}, 'utf8'));
const value = data[path.slice(prefix.length)]; if (!value) process.exit(4);
process.stdout.write(JSON.stringify(value));\n`);
  chmodSync(shim, 0o700);
  // Only PATH is temporarily changed, never HOME or a credential variable.
  const path = process.env.PATH;
  try {
    process.env.PATH = bin;
    const result = await checkLiveHandoff(f.h, f.review);
    assert.equal(result.artifactId, 456);
  } finally { process.env.PATH = path; }
}));

test("signing context fails outside actual approved canonical workflow; pure data fixtures never trigger signing", () => {
  const context = { GITHUB_REPOSITORY: "udochukwu-echefu/lenslayer", GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/heads/main",
    GITHUB_SHA: "a".repeat(40), EXPECTED_VERSION: "0.1.0", PUBLISH_ENABLED: "true", REVIEW_RUN_ID: "42", EXPECTED_SHA256: "b".repeat(64),
    CONFIRMATION: "sign @lenslayer/agent-sdk@0.1.0", RELEASE_OPERATION: "detached-provenance", GITHUB_ACTIONS: "true", GITHUB_SERVER_URL: "https://github.com",
    GITHUB_WORKFLOW_REF: "udochukwu-echefu/lenslayer/.github/workflows/sdk-publish.yml@refs/heads/main", GITHUB_WORKFLOW_SHA: "a".repeat(40), RUNNER_ENVIRONMENT: "github-hosted",
    GITHUB_RUN_ID: "99", GITHUB_RUN_ATTEMPT: "1", GITHUB_REPOSITORY_ID: "1", GITHUB_REPOSITORY_OWNER_ID: "2", REVIEW_RUN_ATTEMPT: "2", REVIEW_ARTIFACT_ID: "123",
    ACTIONS_ID_TOKEN_REQUEST_URL: "synthetic-presence-only", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "synthetic-presence-only" };
  checkSigningContext(context);
  for (const [key, value] of Object.entries({ RELEASE_OPERATION: "publish", GITHUB_ACTIONS: "false", RUNNER_ENVIRONMENT: "self-hosted", PUBLISH_ENABLED: "false",
    GITHUB_WORKFLOW_REF: "other/workflow", GITHUB_WORKFLOW_SHA: "b".repeat(40), ACTIONS_ID_TOKEN_REQUEST_TOKEN: "", NODE_AUTH_TOKEN: "synthetic",
    NPM_TOKEN: "synthetic", NPM_ID_TOKEN: "synthetic", SIGSTORE_ID_TOKEN: "synthetic", GITHUB_RUN_ATTEMPT: "2" })) assert.throws(() => checkSigningContext({ ...context, [key]: value }));
  // No process.env assignment and no invocation of attest/signHandoff here.
});

test("source publish intent refuses missing/false/file-only provenance instead of unsigned default", () => {
  const script = new URL("../scripts/release-intent.mjs", import.meta.url);
  const run = (env) => execFileSync(process.execPath, [script.pathname], { env, stdio: "pipe" });
  run({ npm_config_provenance: "true" });
  assert.throws(() => run({}));
  assert.throws(() => run({ npm_config_provenance: "false" }));
  assert.throws(() => run({ npm_config_provenance_file: "placeholder.sigstore.json" }));
});
