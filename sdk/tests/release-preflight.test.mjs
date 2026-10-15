import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { digest, inspectTarball, packageFiles, packageName, repository } from "../scripts/artifact.mjs";
import { checkLiveHandoff } from "../scripts/github-read.mjs";
import { bootstrapPreflight, checkCheckout, ownerCommand, reviewPreflight, shellQuote } from "../scripts/release-preflight.mjs";

// Synthetic archive/REST metadata, not built SDK bytes, a signature or external acceptance.
async function fixture(run) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "sdk-preflight-")));
  try {
    const reviewDir = join(root, "original review's files"), handoffDir = join(root, "handoff's files");
    mkdirSync(reviewDir); mkdirSync(handoffDir);
    for (const name of packageFiles) {
      const target = join(root, "package", name);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, name.startsWith("dist/") ? "// Synthetic preflight fixture only\n" : readFileSync(new URL(`../${name}`, import.meta.url)));
    }
    const version = "0.1.0", sourceSha = "a".repeat(40), filename = `lenslayer-agent-sdk-${version}.tgz`;
    execFileSync("tar", ["-czf", join(reviewDir, filename), "-C", root, ...packageFiles.map((p) => `package/${p}`)]);
    const bytes = readFileSync(join(reviewDir, filename));
    const review = { schema: 1, repository, name: packageName, version, sourceSha, sourceDirty: false,
      sourceRef: "refs/heads/main", runId: "42", runAttempt: "2", filename, ...inspectTarball(join(reviewDir, filename), version) };
    writeFileSync(join(reviewDir, "review.json"), JSON.stringify(review));
    writeFileSync(join(reviewDir, "pack.json"), JSON.stringify([{ name: packageName, version, filename,
      integrity: review.integrity, shasum: digest(bytes, "sha1"), files: packageFiles.map((path) => ({ path })) }]));
    writeFileSync(join(reviewDir, "SHA256SUMS"), `${review.sha256}  ${filename}\n`);
    cpSync(reviewDir, join(handoffDir, "review"), { recursive: true });
    for (const name of ["handoff.json", "provenance.sigstore.json", "SHA256SUMS"]) writeFileSync(join(handoffDir, name), "synthetic; verifier seam only");
    const expected = { version, sourceSha, sha256: review.sha256, reviewRunId: "42", reviewRunAttempt: "2", runId: "99", runAttempt: "1" };
    const signing = { id: 99, run_attempt: 1, repository: { full_name: repository, private: false },
      head_repository: { full_name: repository, private: false }, path: ".github/workflows/sdk-publish.yml", event: "workflow_dispatch",
      head_branch: "main", head_sha: sourceSha, status: "completed", conclusion: "success",
      run_started_at: new Date(Date.now() - 2000).toISOString(), updated_at: new Date(Date.now() + 2000).toISOString() };
    const artifact = { id: 123, name: `lenslayer-agent-sdk-${sourceSha}-2`, expired: false, digest: `sha256:${"b".repeat(64)}`,
      expires_at: new Date(Date.now() + 3600000).toISOString(), workflow_run: { id: 42, head_sha: sourceSha } };
    const metadata = {
      "git/ref/heads/main": { ref: "refs/heads/main", object: { type: "commit", sha: sourceSha } },
      "actions/runs/42": { ...signing, id: 42, run_attempt: 2, path: ".github/workflows/sdk-release-review.yml" },
      "actions/runs/99": signing,
      "actions/runs/42/artifacts?per_page=100": { total_count: 1, artifacts: [artifact] },
      "actions/runs/99/artifacts?per_page=100": { total_count: 1, artifacts: [{ ...artifact, id: 456, name: `sdk-bootstrap-${version}-${sourceSha}-99-1`, workflow_run: { id: 99, head_sha: sourceSha } }] },
      "actions/workflows/sdk-release-review.yml/runs?event=workflow_dispatch&branch=main&per_page=100": { workflow_runs: [{ id: 42 }] },
      "actions/workflows/sdk-publish.yml/runs?event=workflow_dispatch&branch=main&per_page=100": { workflow_runs: [{ id: 99 }] },
      "actions/variables/SDK_NPM_PUBLISH_ENABLED": { name: "SDK_NPM_PUBLISH_ENABLED", value: "true" },
      "actions/workflows/sdk-publish.yml": { id: 5, path: ".github/workflows/sdk-publish.yml", state: "active" },
      "environments/sdk-npm": { id: 7, name: "sdk-npm", can_admins_bypass: false,
        deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
        protection_rules: [{ type: "required_reviewers", reviewers: [{ type: "User", reviewer: { login: "udochukwu-echefu" } }] }] },
      "environments/sdk-npm/deployment-branch-policies?per_page=100": { total_count: 1, branch_policies: [{ name: "main", type: "branch" }] },
      "actions/runs/99/approvals": [{ state: "approved", environments: [{ id: 7, name: "sdk-npm" }], user: { login: "udochukwu-echefu" } }],
      [`git/ref/tags/sdk-v${version}`]: { ref: `refs/tags/sdk-v${version}`, object: { type: "commit", sha: sourceSha } },
    };
    const get = async (path) => { assert.ok(path in metadata, `Unexpected GET ${path}`); return structuredClone(metadata[path]); };
    const sourceCheck = (sha) => assert.equal(sha, sourceSha);
    const verify = async (directory, e, options) => {
      assert.equal(directory, handoffDir); assert.deepEqual(e, expected); assert.equal(options.get, get);
      return { sourceSha, sha256: review.sha256, artifactId: 456 };
    };
    const handoff = { version, signingRunId: "99", signingRunAttempt: "1", sourceSha,
      createdAt: new Date().toISOString(), reviewArtifactId: "123" };
    await run({ root, reviewDir, handoffDir, review, expected, metadata, get, sourceCheck, verify, handoff });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("owner live policy requires explicit boolean false admin bypass, including its absence and malformed values", () => fixture(async (f) => {
  await checkLiveHandoff(f.handoff, f.review, f.get);
  for (const value of [true, undefined, null, "false", 0]) {
    f.metadata["environments/sdk-npm"].can_admins_bypass = value;
    await assert.rejects(checkLiveHandoff(f.handoff, f.review, f.get), /admin bypass/);
  }
  delete f.metadata["environments/sdk-npm"].can_admins_bypass;
  await assert.rejects(checkLiveHandoff(f.handoff, f.review, f.get), /admin bypass/);
}));

test("review preflight records exact source/attempt, separate ZIP digest and all four original hashes without packing", () => fixture(async (f) => {
  const result = await reviewPreflight(f.reviewDir, f.expected, f);
  assert.equal(result.sourceSha, f.expected.sourceSha);
  assert.equal(result.reviewRunAttempt, "2");
  assert.equal(result.reviewArtifact.id, 123);
  assert.equal(result.reviewArtifact.githubZipDigest, `sha256:${"b".repeat(64)}`);
  assert.equal(result.reviewFileSha256[f.review.filename], f.expected.sha256);
  assert.equal(Object.keys(result.reviewFileSha256).length, 4);
  assert.equal(result.ownerTerminalCommand, undefined);
}));

test("review refuses stale main/attempt/latest dispatch and expired, incomplete or unverifiable artifact metadata", () => fixture(async (f) => {
  const original = structuredClone(f.metadata);
  for (const mutate of [
    (m) => { m["git/ref/heads/main"].object.sha = "c".repeat(40); },
    (m) => { m["actions/runs/42"].run_attempt = 3; },
    (m) => { m["actions/runs/42"].repository.private = true; },
    (m) => { m["actions/workflows/sdk-release-review.yml/runs?event=workflow_dispatch&branch=main&per_page=100"].workflow_runs[0].id = 43; },
    (m) => { m["actions/runs/42/artifacts?per_page=100"].total_count = 101; },
    ...[true, undefined].map((expired) => (m) => { m["actions/runs/42/artifacts?per_page=100"].artifacts[0].expired = expired; }),
    (m) => { m["actions/runs/42/artifacts?per_page=100"].artifacts[0].digest = undefined; },
    (m) => { m["actions/runs/42/artifacts?per_page=100"].artifacts[0].expires_at = new Date(0).toISOString(); },
    (m) => { m["actions/runs/42/artifacts?per_page=100"].artifacts[0].workflow_run.id = 43; },
  ]) {
    Object.assign(f.metadata, structuredClone(original)); mutate(f.metadata);
    await assert.rejects(reviewPreflight(f.reviewDir, f.expected, f));
  }
  await assert.rejects(reviewPreflight(f.reviewDir, f.expected, { ...f, get: async () => { throw Error("Unavailable"); } }), /Unavailable/);
}));

test("review refuses source-check failures, wrong approved hash/source and metadata/local changes during reads", () => fixture(async (f) => {
  await assert.rejects(reviewPreflight(f.reviewDir, f.expected, { ...f, sourceCheck: () => { throw Error("Dirty"); } }), /Dirty/);
  for (const changes of [{ sha256: "b".repeat(64) }, { sourceSha: "b".repeat(40) }])
    await assert.rejects(reviewPreflight(f.reviewDir, { ...f.expected, ...changes }, f));
  let reads = 0;
  await assert.rejects(reviewPreflight(f.reviewDir, f.expected, { ...f, get: async (path) => {
    const value = await f.get(path);
    if (path === "actions/runs/42" && ++reads === 2) value.run_attempt = 3;
    return value;
  } }), /attempt/);
  await assert.rejects(reviewPreflight(f.reviewDir, f.expected, { ...f, get: async (path) => {
    if (path === "git/ref/heads/main") writeFileSync(join(f.reviewDir, "SHA256SUMS"), "changed");
    return f.get(path);
  } }));
}));

test("bootstrap compares all original review bytes and propagates verifier failure instead of emitting a command", () => fixture(async (f) => {
  await assert.rejects(bootstrapPreflight(f.reviewDir, f.handoffDir, f.expected, { ...f, verify: async () => { throw Error("No real signature"); } }), /No real signature/);
  for (const name of [f.review.filename, "review.json", "pack.json", "SHA256SUMS"]) {
    const path = join(f.handoffDir, "review", name), original = readFileSync(path);
    writeFileSync(path, Buffer.concat([original, Buffer.from("\n")]));
    await assert.rejects(bootstrapPreflight(f.reviewDir, f.handoffDir, f.expected, f), /never repack/);
    writeFileSync(path, original);
  }
  await assert.rejects(bootstrapPreflight(join(f.handoffDir, "review"), f.handoffDir, f.expected, f), /separately/);
  await assert.rejects(bootstrapPreflight(f.reviewDir, f.handoffDir, { ...f.expected, runAttempt: "2" }, f), /attempt-1/);
}));

test("bootstrap emits exact quoted original paths, rechecks before/after owner login and never executes npm", () => fixture(async (f) => {
  const result = await bootstrapPreflight(f.reviewDir, f.handoffDir, f.expected, f);
  const command = result.ownerTerminalCommand;
  assert.equal(command.split("bootstrap-check").length - 1, 2);
  assert.ok(command.indexOf("bootstrap-check") < command.indexOf("npm login"));
  assert.ok(command.lastIndexOf("bootstrap-check") > command.indexOf("npm login"));
  assert.match(command, /npm publish .* --provenance-file=.* --ignore-scripts --access public --tag latest/);
  assert.ok(command.includes(shellQuote(join(f.handoffDir, "review", f.review.filename))));
  assert.ok(command.includes(shellQuote(f.expected.sourceSha)));
  assert.doesNotMatch(command, /npm (?:pack|ci|install|stage)|--provenance(?:\s|=)|NODE_AUTH_TOKEN/);
  // Shell syntax/quoting only: no command in the generated release block runs.
  execFileSync("/bin/sh", ["-n"], { input: command });
  assert.equal(execFileSync("/bin/sh", ["-c", `printf '%s' ${shellQuote("path's $(must-not-run) file")}`], { encoding: "utf8" }), "path's $(must-not-run) file");
  assert.equal(result.handoffArtifact.id, 456);
}));

test("bootstrap detects local handoff changes across real-verifier boundary", () => fixture(async (f) => {
  await assert.rejects(bootstrapPreflight(f.reviewDir, f.handoffDir, f.expected, { ...f, verify: async (...args) => {
    const result = await f.verify(...args);
    writeFileSync(join(f.handoffDir, "provenance.sigstore.json"), "changed");
    return result;
  } }), /changed during verification/);
}));

test("checkout guard refuses missing HEAD, wrong source, dirty tracked and untracked release code", () => {
  const sha = "a".repeat(40);
  const clean = (_command, args) => args[0] === "rev-parse" ? sha : "";
  checkCheckout(sha, clean);
  assert.throws(() => checkCheckout(sha, () => { throw Error("No HEAD"); }), /No HEAD/);
  assert.throws(() => checkCheckout("b".repeat(40), clean), /exact reviewed/);
  for (const untracked of [false, true]) assert.throws(() => checkCheckout(sha, (command, args) => {
    if (args[0] === "status" && (!untracked || args.includes("--untracked-files=normal"))) return "?? sdk/scripts/unreviewed.mjs";
    return clean(command, args);
  }), /invalidate/);
  assert.throws(() => checkCheckout(sha, (command, args) => {
    if (args[0] === "ls-files") throw Error("Tool not tracked");
    return clean(command, args);
  }), /not tracked/);
});

test("CLI rejects incomplete inputs without any GitHub/signing/publication access", () => {
  assert.throws(() => execFileSync(process.execPath, [fileURLToPath(new URL("../scripts/release-preflight.mjs", import.meta.url))], { stdio: "pipe", env: {} }), /Usage:/);
  assert.ok(ownerCommand("/review", "/handoff", { sourceSha: "a".repeat(40) }).endsWith("\n)"));
});

test("actual review CLI binds all six positional inputs using sanitized GET/git stubs, with no credentials or network", () => fixture(async (f) => {
  const bin = join(f.root, "bin"); mkdirSync(bin);
  const gh = join(bin, "gh"), git = join(bin, "git");
  writeFileSync(gh, `#!${process.execPath}\nconst assert=require('node:assert/strict');
const args=process.argv.slice(2); assert.deepEqual(args.slice(0,5),['api','--hostname','github.com','--method','GET']);
const prefix='repos/${repository}/'; assert.ok(args.at(-1).startsWith(prefix));
const value=${JSON.stringify(f.metadata)}[args.at(-1).slice(prefix.length)]; assert.ok(value); process.stdout.write(JSON.stringify(value));\n`);
  writeFileSync(git, `#!${process.execPath}\nconst args=process.argv.slice(2);
if(args[0]==='rev-parse') process.stdout.write('${f.expected.sourceSha}');
else if(!['status','ls-files'].includes(args[0])) process.exit(2);\n`);
  chmodSync(gh, 0o700); chmodSync(git, 0o700);
  const e = f.expected;
  const args = [fileURLToPath(new URL("../scripts/release-preflight.mjs", import.meta.url)), "review", f.reviewDir,
    e.version, e.sha256, e.reviewRunId, e.reviewRunAttempt, e.sourceSha];
  const options = { env: { PATH: `${bin}:/usr/bin:/bin` }, encoding: "utf8", stdio: "pipe" };
  const report = JSON.parse(execFileSync(process.execPath, args, options));
  assert.equal(report.sourceSha, e.sourceSha); assert.equal(report.reviewArtifact.id, 123);
  assert.equal(report.reviewRunId, "42"); assert.equal(report.reviewRunAttempt, "2");
  const spaced = join(f.root, "iCloud Drive Local", "sdk", "scripts");
  cpSync(new URL("../scripts/", import.meta.url), spaced, { recursive: true });
  const spacedReport = JSON.parse(execFileSync(process.execPath, [join(spaced, "release-preflight.mjs"), ...args.slice(1)], options));
  assert.equal(spacedReport.sourceSha, e.sourceSha);
  assert.equal(spacedReport.reviewArtifact.id, 123);
  assert.throws(() => execFileSync(process.execPath, [...args.slice(0, -1), "b".repeat(40)], options));
  // No CLI injection seam: synthetic sidecars must reach the real verifier and
  // fail without printing an executable owner command (even with valid GETs).
  for (const mode of ["bootstrap", "bootstrap-check"]) {
    assert.throws(() => execFileSync(process.execPath, [args[0], mode, f.reviewDir, f.handoffDir,
      e.version, e.sha256, e.reviewRunId, e.reviewRunAttempt, e.runId, e.runAttempt, e.sourceSha], options), (error) => {
      assert.match(error.stderr.toString(), /SyntaxError/);
      assert.doesNotMatch(error.stdout.toString(), /ownerTerminalCommand|npm publish/);
      return true;
    });
  }
}));
