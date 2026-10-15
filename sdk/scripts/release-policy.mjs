import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { repository } from "./artifact.mjs";

export function checkDispatch(env, version, publishing = false) {
  assert.equal(env.GITHUB_REPOSITORY, repository, "Only the canonical repository can release");
  assert.equal(env.GITHUB_EVENT_NAME, "workflow_dispatch", "Human dispatch required");
  assert.equal(env.GITHUB_REF, "refs/heads/main", "Dispatch on main, not a branch or tag");
  assert.match(env.GITHUB_SHA, /^[a-f0-9]{40}$/);
  assert.match(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  if (publishing) {
    const operation = env.RELEASE_OPERATION || "publish";
    assert.ok(["publish", "detached-provenance"].includes(operation), "Unknown release operation");
    if (operation === "detached-provenance") {
      assert.equal(env.GITHUB_RUN_ATTEMPT, "1", "Detached signing requires attempt 1; create a fresh workflow dispatch after any rerun");
    }
    assert.equal(env.PUBLISH_ENABLED, "true", "Release dispatch/job enable snapshot must be true; closure also requires disabling workflow and cancelling in-flight runs");
    assert.match(env.REVIEW_RUN_ID, /^[1-9]\d*$/);
    assert.match(env.EXPECTED_SHA256, /^[a-f0-9]{64}$/);
    assert.equal(env.CONFIRMATION, `${operation === "publish" ? "publish" : "sign"} @lenslayer/agent-sdk@${version}`);
  }
}

export function checkReviewRun(run, env) {
  assert.equal(run.repository.full_name, repository);
  assert.equal(run.head_repository.full_name, repository);
  assert.equal(String(run.id), env.REVIEW_RUN_ID);
  assert.equal(run.path, ".github/workflows/sdk-release-review.yml");
  assert.equal(run.event, "workflow_dispatch");
  assert.equal(run.head_branch, "main");
  assert.equal(run.head_sha, env.GITHUB_SHA, "Reviewed source must equal this main dispatch commit");
  assert.equal(run.status, "completed");
  assert.equal(run.conclusion, "success");
  assert.ok(Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0);
}

export function checkCurrentMain(ref, env) {
  assert.equal(ref.ref, "refs/heads/main");
  assert.equal(ref.object.type, "commit");
  assert.equal(ref.object.sha, env.GITHUB_SHA, "Main advanced since dispatch/review; review the new main commit");
}

export function selectReviewArtifact(artifacts, env, attempt) {
  const expectedName = `lenslayer-agent-sdk-${env.GITHUB_SHA}-${attempt}`;
  const matching = artifacts.filter((artifact) => artifact.name === expectedName && !artifact.expired);
  assert.equal(matching.length, 1, "One unexpired review artifact for the successful run attempt is required");
  assert.equal(matching[0].workflow_run.head_sha, env.GITHUB_SHA);
  assert.ok(Number.isSafeInteger(matching[0].id) && matching[0].id > 0);
  return matching[0].id;
}

export function checkLiveEnable(variable) {
  // Owner-side managed gh may read this live variable. CI cannot: its existing
  // GITHUB_TOKEN has no documented Variables:read capability.
  assert.ok(variable && typeof variable === "object" && !Array.isArray(variable), "Live release switch must be a repository variable object");
  assert.equal(variable.name, "SDK_NPM_PUBLISH_ENABLED", "Wrong live release switch");
  assert.equal(variable.value, "true", "Owner has closed the live release window");
}

export function checkWorkflowEnabled(workflow) {
  assert.ok(workflow && typeof workflow === "object" && !Array.isArray(workflow), "Self-workflow metadata must be an object");
  assert.ok(Number.isSafeInteger(workflow.id) && workflow.id > 0, "Self-workflow ID missing or malformed");
  assert.equal(workflow.path, ".github/workflows/sdk-publish.yml", "Wrong canonical self-workflow");
  assert.equal(workflow.state, "active", "Release workflow is disabled or unavailable; no external release action permitted");
}

// Only the existing managed Actions token is used with documented Actions:read
// and Contents:read resources. Repository-variable reads are intentionally NOT
// allowed here: CI's enable flag is a snapshot, not a live revocation control.
export async function releaseMetadata(path, env) {
  assert.match(path, /^(?:actions\/workflows\/sdk-publish\.yml|git\/ref\/heads\/main|actions\/runs\/[1-9]\d*(?:\/artifacts\?per_page=100)?)$/);
  assert.ok(typeof env.GH_TOKEN === "string" && env.GH_TOKEN.length > 0, "Managed GitHub metadata authentication unavailable");
  const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
    method: "GET", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28", "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
  assert.equal(response.status, 200, "Release workflow/source metadata unreadable; no external release action permitted");
  return response.json();
}

export async function checkReleaseBoundary(env) {
  checkDispatch(env, env.EXPECTED_VERSION, true);
  // Fresh Actions:read workflow-state observation, not a fresh variable read.
  // Disabling the workflow must be accompanied by owner cancellation of all
  // in-flight runs. Neither this GET nor a snapshot locks or revokes an action.
  checkWorkflowEnabled(await releaseMetadata("actions/workflows/sdk-publish.yml", env));
  const tagSha = execFileSync("git", ["rev-parse", `refs/tags/sdk-v${env.EXPECTED_VERSION}^{commit}`], { encoding: "utf8" }).trim();
  assert.equal(tagSha, env.GITHUB_SHA, "Release tag must bind the reviewed main commit");
  checkCurrentMain(await releaseMetadata("git/ref/heads/main", env), env);
  const run = await releaseMetadata(`actions/runs/${env.REVIEW_RUN_ID}`, env);
  checkReviewRun(run, env);
  const artifacts = await releaseMetadata(`actions/runs/${env.REVIEW_RUN_ID}/artifacts?per_page=100`, env);
  const artifactId = selectReviewArtifact(artifacts.artifacts, env, run.run_attempt);
  // At the final boundary, bind the just-rechecked review to the already
  // downloaded bundle, rather than silently switching to a new review attempt.
  if (env.REVIEW_RUN_ATTEMPT !== undefined) assert.equal(String(run.run_attempt), env.REVIEW_RUN_ATTEMPT, "Review attempt changed after download");
  if (env.REVIEW_ARTIFACT_ID !== undefined) assert.equal(String(artifactId), env.REVIEW_ARTIFACT_ID, "Review artifact changed after download");
  checkCurrentMain(await releaseMetadata("git/ref/heads/main", env), env);
  checkWorkflowEnabled(await releaseMetadata("actions/workflows/sdk-publish.yml", env));
  return { artifactId, reviewRunAttempt: run.run_attempt };
}

if (process.argv[2] === "github") {
  const env = process.env;
  const publishing = process.argv[3] === "publish";
  checkDispatch(env, env.EXPECTED_VERSION, publishing);
  if (publishing) {
    const { artifactId, reviewRunAttempt } = await checkReleaseBoundary(env);
    appendFileSync(env.GITHUB_OUTPUT, `artifact_id=${artifactId}\nreview_run_attempt=${reviewRunAttempt}\n`);
  }
}
