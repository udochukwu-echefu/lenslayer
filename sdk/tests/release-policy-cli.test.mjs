import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/release-policy.mjs", import.meta.url));
const repository = "udochukwu-echefu/lenslayer", sha = "a".repeat(40);

// Executes the REAL release-policy CLI. Only its external fetch and git process
// boundary are replaced by sanitized local fixtures. No auth stores, actual Git
// tag/commit, network, signer, npm command or release operation is used.
function cliFixture(run) {
  const root = mkdtempSync(join(tmpdir(), "sdk-live-policy-cli-"));
  try {
    const bin = join(root, "bin"); mkdirSync(bin);
    const plan = join(root, "plan.json"), log = join(root, "requests.jsonl");
    const gitLog = join(root, "git.log"), output = join(root, "output.txt"), next = join(root, "downstream-marker");
    const git = join(bin, "git");
    writeFileSync(git, `#!${process.execPath}\nconst fs=require('node:fs');fs.appendFileSync(${JSON.stringify(gitLog)},'git\\n');process.stdout.write(${JSON.stringify(`${sha}\n`)});\n`);
    chmodSync(git, 0o700);
    const preload = join(root, "fetch.mjs");
    writeFileSync(preload, `import assert from 'node:assert/strict';
import { readFileSync, appendFileSync } from 'node:fs';
const plan = JSON.parse(readFileSync(${JSON.stringify(plan)})); let workflowReads = 0;
const prefix = 'https://api.github.com/repos/${repository}/';
globalThis.fetch = async (url, options) => {
  assert.ok(url.startsWith(prefix)); assert.equal(options.method, 'GET');
  assert.equal(options.cache, 'no-store'); assert.equal(options.redirect, 'error');
  assert.equal(options.headers['Cache-Control'], 'no-cache');
  assert.ok(options.signal); assert.equal(options.headers.Authorization, 'Bearer synthetic-managed-actions-fixture');
  const path = url.slice(prefix.length); appendFileSync(${JSON.stringify(log)}, JSON.stringify(path)+'\\n');
  if (path === 'actions/workflows/sdk-publish.yml') {
    const value = plan.workflows[Math.min(workflowReads++, plan.workflows.length-1)];
    if (value.error) throw Error('Synthetic metadata unavailable');
    return { status: value.status, json: async () => { if (value.malformed) throw SyntaxError('Synthetic malformed JSON'); return value.body; } };
  }
  const data = {
    'git/ref/heads/main': { ref:'refs/heads/main', object:{type:'commit',sha:plan.mainSha || '${sha}'} },
    'actions/runs/42': { id:42, repository:{full_name:'${repository}'}, head_repository:{full_name:'${repository}'}, path:'.github/workflows/sdk-release-review.yml', event:'workflow_dispatch', head_branch:'main', head_sha:'${sha}', status:'completed', conclusion:'success', run_attempt:plan.reviewAttempt || 2 },
    'actions/runs/42/artifacts?per_page=100': { artifacts:[{id:123,name:'lenslayer-agent-sdk-${sha}-'+(plan.reviewAttempt || 2),expired:false,workflow_run:{head_sha:'${sha}'}}] },
  };
  assert.ok(path in data); return {status:200,json:async()=>data[path]};
};\n`);
    const env = { PATH: bin, GITHUB_REPOSITORY: repository, GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/heads/main",
      GITHUB_SHA: sha, EXPECTED_VERSION: "0.1.0", PUBLISH_ENABLED: "true", REVIEW_RUN_ID: "42", EXPECTED_SHA256: "b".repeat(64),
      CONFIRMATION: "publish @lenslayer/agent-sdk@0.1.0", RELEASE_OPERATION: "publish", GITHUB_RUN_ATTEMPT: "1",
      GH_TOKEN: "synthetic-managed-actions-fixture", GITHUB_OUTPUT: output };
    const execute = (data, changes = {}) => {
      for (const path of [log, gitLog, output, next]) rmSync(path, { force: true });
      writeFileSync(plan, JSON.stringify(data));
      execFileSync(process.execPath, ["--import", preload, script, "github", "publish"], {
        env: { ...env, ...changes }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10000 });
      // Represents the caller continuing past a successful CLI; never a signer
      // or publisher. Hostile cases must stop before this marker is written.
      writeFileSync(next, "boundary passed");
    };
    run({ execute, output, next, gitLog, requests: () => existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").map(JSON.parse) : [] });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

const enabled = { status: 200, body: { id: 5, path: ".github/workflows/sdk-publish.yml", state: "active" } };

test("real release CLI refuses a disabled/deleted/unreadable/malformed self-workflow before downstream actions", () => cliFixture((f) => {
  const cases = [
    ...["disabled_manually", "disabled_inactivity", "disabled_fork", "deleted", "unknown"].map((state) => ({ status: 200, body: { ...enabled.body, state } })),
    { status: 404, body: { message: "Not Found" } },
    { status: 403, body: { message: "Resource not accessible by integration" } },
    { status: 500, body: {} }, { error: true }, { status: 200, malformed: true },
    { status: 200, body: {} }, { status: 200, body: null }, { status: 200, body: [] },
    { status: 200, body: { ...enabled.body, path: ".github/workflows/other.yml" } },
    { status: 200, body: { ...enabled.body, state: true } },
    { status: 200, body: { ...enabled.body, id: "5" } },
  ];
  for (const operation of ["publish", "detached-provenance"]) {
    for (const observation of cases) {
      assert.throws(() => f.execute({ workflows: [observation] }, { RELEASE_OPERATION: operation,
        CONFIRMATION: `${operation === "publish" ? "publish" : "sign"} @lenslayer/agent-sdk@0.1.0` }));
      assert.deepEqual(f.requests(), ["actions/workflows/sdk-publish.yml"]);
      assert.equal(existsSync(f.output), false);
      assert.equal(existsSync(f.gitLog), false, "Disabled workflow must stop even before local tag inspection");
      assert.equal(existsSync(f.next), false);
    }
  }
}));

test("real release CLI samples fresh workflow state again after source/review lookup, rejecting owner disable during setup", () => cliFixture((f) => {
  for (const final of [{ status: 200, body: { ...enabled.body, state: "disabled_manually" } }, { status: 404 }, { status: 403 }]) {
    assert.throws(() => f.execute({ workflows: [enabled, final] }));
    assert.equal(f.requests().filter((path) => path === "actions/workflows/sdk-publish.yml").length, 2);
    assert.equal(existsSync(f.output), false);
    assert.equal(existsSync(f.next), false);
  }
}));

test("real release CLI supports Actions-read workflow metadata but rejects changed downloaded review identity and all detached reruns", () => cliFixture((f) => {
  f.execute({ workflows: [enabled] }, { REVIEW_RUN_ATTEMPT: "2", REVIEW_ARTIFACT_ID: "123" });
  assert.match(readFileSync(f.output, "utf8"), /artifact_id=123\nreview_run_attempt=2\n/);
  assert.equal(f.requests().filter((path) => path === "actions/workflows/sdk-publish.yml").length, 2);
  assert.equal(existsSync(f.next), true);
  f.execute({ workflows: [enabled] }, { RELEASE_OPERATION: "detached-provenance", CONFIRMATION: "sign @lenslayer/agent-sdk@0.1.0" });
  assert.equal(existsSync(f.next), true);
  for (const changes of [{ REVIEW_RUN_ATTEMPT: "1" }, { REVIEW_ARTIFACT_ID: "999" }]) {
    assert.throws(() => f.execute({ workflows: [enabled] }, changes));
    assert.equal(existsSync(f.next), false);
  }
  assert.throws(() => f.execute({ workflows: [enabled] }, { RELEASE_OPERATION: "detached-provenance",
    CONFIRMATION: "sign @lenslayer/agent-sdk@0.1.0", GITHUB_RUN_ATTEMPT: "2" }));
  assert.deepEqual(f.requests(), []);
  assert.equal(existsSync(f.next), false);
}));

test("CI enable is explicitly snapshot-only: missing/false snapshot refuses, but flag closure alone cannot revoke an already-captured true", () => cliFixture((f) => {
  for (const snapshot of ["", "false", "TRUE", "1"]) {
    assert.throws(() => f.execute({ workflows: [enabled] }, { PUBLISH_ENABLED: snapshot }));
    assert.deepEqual(f.requests(), []);
    assert.equal(existsSync(f.next), false);
  }
  // Honest narrowed contract: a later variable false/deletion is NOT observed
  // through CI's unsupported Variables endpoint. Owner must disable + cancel.
  for (const currentVariable of [false, null]) {
    f.execute({ workflows: [enabled], currentVariable });
    assert.equal(existsSync(f.next), true);
    assert.ok(!f.requests().some((path) => path.includes("/variables/")));
  }
  assert.throws(() => f.execute({ workflows: [enabled], mainSha: "c".repeat(40) }));
  assert.equal(existsSync(f.next), false, "Live-main guard must still operate");
}));
