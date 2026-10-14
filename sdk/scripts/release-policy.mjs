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
    assert.equal(env.PUBLISH_ENABLED, "true", "Release owner must enable SDK_NPM_PUBLISH_ENABLED");
    assert.match(env.REVIEW_RUN_ID, /^[1-9]\d*$/);
    assert.match(env.EXPECTED_SHA256, /^[a-f0-9]{64}$/);
    assert.equal(env.CONFIRMATION, `publish @lenslayer/agent-sdk@${version}`);
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

export function selectReviewArtifact(artifacts, env, attempt) {
  const expectedName = `lenslayer-agent-sdk-${env.GITHUB_SHA}-${attempt}`;
  const matching = artifacts.filter((artifact) => artifact.name === expectedName && !artifact.expired);
  assert.equal(matching.length, 1, "One unexpired review artifact for the successful run attempt is required");
  assert.equal(matching[0].workflow_run.head_sha, env.GITHUB_SHA);
  assert.ok(Number.isSafeInteger(matching[0].id) && matching[0].id > 0);
  return matching[0].id;
}

if (process.argv[2] === "github") {
  const env = process.env;
  const publishing = process.argv[3] === "publish";
  checkDispatch(env, env.EXPECTED_VERSION, publishing);
  if (publishing) {
    const tagSha = execFileSync("git", ["rev-parse", `refs/tags/sdk-v${env.EXPECTED_VERSION}^{commit}`], { encoding: "utf8" }).trim();
    assert.equal(tagSha, env.GITHUB_SHA, "Release tag must bind the reviewed main commit");
    const get = async (path) => {
      const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
        headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      });
      assert.equal(response.status, 200, "Release metadata unavailable");
      return response.json();
    };
    const run = await get(`actions/runs/${env.REVIEW_RUN_ID}`);
    checkReviewRun(run, env);
    const artifacts = await get(`actions/runs/${env.REVIEW_RUN_ID}/artifacts?per_page=100`);
    const artifactId = selectReviewArtifact(artifacts.artifacts, env, run.run_attempt);
    appendFileSync(env.GITHUB_OUTPUT, `artifact_id=${artifactId}\nreview_run_attempt=${run.run_attempt}\n`);
  }
}
