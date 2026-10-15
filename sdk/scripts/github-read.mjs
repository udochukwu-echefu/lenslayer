import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { repository } from "./artifact.mjs";
import { checkCurrentMain, checkLiveEnable, checkReviewRun, checkWorkflowEnabled, selectReviewArtifact } from "./release-policy.mjs";
import { handoffArtifactName } from "./handoff.mjs";

// The only owner-side authenticated interface. Fixed canonical GET resources,
// no shell, no credential extraction, no token input/output, no registry access.
export function githubGet(resource, execute = execFileSync) {
  assert.match(resource, /^(?:git\/ref\/heads\/main|git\/ref\/tags\/sdk-v\d+\.\d+\.\d+|git\/tags\/[a-f0-9]{40}|actions\/variables\/SDK_NPM_PUBLISH_ENABLED|actions\/runs\/[1-9]\d*(?:\/artifacts\?per_page=100|\/approvals)?|actions\/workflows\/sdk-publish\.yml|actions\/workflows\/sdk-(?:publish|release-review)\.yml\/runs\?event=workflow_dispatch&branch=main&per_page=100|environments\/sdk-npm(?:\/deployment-branch-policies\?per_page=100)?)$/);
  const output = execute("gh", ["api", "--hostname", "github.com", "--method", "GET",
    "-H", "Accept: application/vnd.github+json", "-H", "X-GitHub-Api-Version: 2022-11-28",
    `repos/${repository}/${resource}`], { encoding: "utf8", timeout: 30000, maxBuffer: 4 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(output);
}

export function checkSigningRun(run, handoff) {
  // The approvals endpoint is run-wide and has no review timestamp/attempt.
  // Accepting attempt 2+ could reuse attempt 1's owner approval. Fail closed
  // even when both the supplied handoff and current run agree on the rerun.
  assert.equal(handoff.signingRunAttempt, "1", "Owner approval is only usable for a fresh attempt-1 signing dispatch");
  assert.equal(run.run_attempt, 1, "Signing was rerun; obtain fresh owner approval on a new dispatch");
  assert.equal(run.repository.full_name, repository);
  assert.equal(run.head_repository.full_name, repository);
  assert.equal(run.repository.private, false, "Public canonical repository required");
  assert.equal(run.head_repository.private, false);
  assert.equal(String(run.id), handoff.signingRunId);
  assert.equal(String(run.run_attempt), handoff.signingRunAttempt, "Signing attempt was superseded");
  assert.equal(run.path, ".github/workflows/sdk-publish.yml");
  assert.equal(run.event, "workflow_dispatch");
  assert.equal(run.head_branch, "main");
  assert.equal(run.head_sha, handoff.sourceSha);
  assert.equal(run.status, "completed");
  assert.equal(run.conclusion, "success");
  assert.ok(Date.parse(run.run_started_at) <= Date.parse(handoff.createdAt), "Handoff predates signing attempt");
  assert.ok(Date.parse(handoff.createdAt) <= Date.parse(run.updated_at), "Handoff postdates signing completion");
}

export async function checkLiveHandoff(handoff, review, get = githubGet) {
  const env = { GITHUB_SHA: review.sourceSha, REVIEW_RUN_ID: review.runId };
  const [main, variable, run, reviewRun, reviewArtifacts, handoffArtifacts, latestSigning, latestReview, approvals, environment, branches, workflow] = await Promise.all([
    get("git/ref/heads/main"), get("actions/variables/SDK_NPM_PUBLISH_ENABLED"),
    get(`actions/runs/${handoff.signingRunId}`), get(`actions/runs/${review.runId}`),
    get(`actions/runs/${review.runId}/artifacts?per_page=100`),
    get(`actions/runs/${handoff.signingRunId}/artifacts?per_page=100`),
    get("actions/workflows/sdk-publish.yml/runs?event=workflow_dispatch&branch=main&per_page=100"),
    get("actions/workflows/sdk-release-review.yml/runs?event=workflow_dispatch&branch=main&per_page=100"),
    get(`actions/runs/${handoff.signingRunId}/approvals`), get("environments/sdk-npm"),
    get("environments/sdk-npm/deployment-branch-policies?per_page=100"),
    get("actions/workflows/sdk-publish.yml"),
  ]);
  checkCurrentMain(main, env);
  checkLiveEnable(variable);
  checkWorkflowEnabled(workflow);
  checkSigningRun(run, handoff);
  checkReviewRun(reviewRun, env);
  assert.equal(String(reviewRun.run_attempt), review.runAttempt, "Review attempt was superseded");
  for (const listing of [reviewArtifacts, handoffArtifacts]) {
    assert.ok(Number.isSafeInteger(listing.total_count) && listing.total_count <= 100, "Artifact listing incomplete");
    assert.equal(listing.total_count, listing.artifacts.length);
  }
  assert.equal(String(selectReviewArtifact(reviewArtifacts.artifacts, env, reviewRun.run_attempt)), handoff.reviewArtifactId);
  const matching = handoffArtifacts.artifacts.filter((a) => a.name === handoffArtifactName(handoff) && !a.expired);
  assert.equal(matching.length, 1, "One current unexpired handoff artifact required");
  assert.equal(matching[0].workflow_run.head_sha, review.sourceSha);
  assert.ok(Number.isSafeInteger(matching[0].id) && matching[0].id > 0);
  // Conservative: even a newer failed/in-progress dispatch revokes this handoff.
  assert.equal(String(latestSigning.workflow_runs[0].id), handoff.signingRunId, "A newer release dispatch superseded the handoff");
  assert.equal(String(latestReview.workflow_runs[0].id), review.runId, "A newer review dispatch requires renewed review");
  assert.equal(environment.name, "sdk-npm");
  assert.deepEqual(environment.deployment_branch_policy, { protected_branches: false, custom_branch_policies: true });
  assert.equal(branches.total_count, 1);
  assert.equal(branches.branch_policies.length, 1);
  assert.equal(branches.branch_policies[0].name, "main");
  assert.equal(branches.branch_policies[0].type, "branch");
  const owner = repository.split("/")[0];
  const rules = environment.protection_rules.filter((rule) => rule.type === "required_reviewers");
  assert.equal(rules.length, 1);
  assert.ok(rules[0].reviewers.some((r) => r.type === "User" && r.reviewer.login === owner), "Owner reviewer must remain configured");
  const reviews = approvals.filter((r) => r.environments.some((e) => e.name === "sdk-npm" && e.id === environment.id));
  // Only now, with both actual run and signed handoff restricted to attempt 1,
  // can run-wide history not refer to an earlier attempt of this same run.
  assert.ok(reviews.some((r) => r.state === "approved" && r.user.login === owner), "Actual owner environment approval is required");
  assert.ok(!reviews.some((r) => r.state === "rejected"), "Rejected approval history requires a new signing run");
  const tag = await get(`git/ref/tags/sdk-v${review.version}`);
  assert.equal(tag.ref, `refs/tags/sdk-v${review.version}`);
  let object = tag.object;
  for (let depth = 0; object.type === "tag" && depth < 4; depth++) {
    assert.match(object.sha, /^[a-f0-9]{40}$/);
    const annotated = await get(`git/tags/${object.sha}`);
    assert.equal(annotated.sha, object.sha);
    object = annotated.object;
  }
  assert.equal(object.type, "commit");
  assert.equal(object.sha, review.sourceSha, "Release tag no longer binds the reviewed source");
  // Recheck at the end of the potentially slow managed-auth metadata reads.
  // These are point-in-time checks, not a lock on subsequent owner changes.
  checkCurrentMain(await get("git/ref/heads/main"), env);
  const finalVariable = await get("actions/variables/SDK_NPM_PUBLISH_ENABLED");
  checkLiveEnable(finalVariable);
  checkWorkflowEnabled(await get("actions/workflows/sdk-publish.yml"));
  checkSigningRun(await get(`actions/runs/${handoff.signingRunId}`), handoff);
  return { signingRunId: handoff.signingRunId, signingRunAttempt: handoff.signingRunAttempt, artifactId: matching[0].id };
}
