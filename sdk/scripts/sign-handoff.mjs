import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { attest } from "sigstore";
import { digest, repository } from "./artifact.mjs";
import { checkDispatch, checkReleaseBoundary } from "./release-policy.mjs";
import { makeHandoff, readReview, bundleFilename, handoffFilename } from "./handoff.mjs";
import { payloadType, provenanceStatement, verifyProvenanceBundle, workflowPath } from "./provenance.mjs";

export function checkSigningContext(env) {
  checkDispatch(env, env.EXPECTED_VERSION, true);
  assert.equal(env.RELEASE_OPERATION, "detached-provenance", "Signing is explicit opt-in only");
  assert.equal(env.GITHUB_RUN_ATTEMPT, "1", "Detached signing requires a fresh attempt-1 owner approval; dispatch a new run");
  assert.equal(env.GITHUB_ACTIONS, "true", "Real Actions context required");
  assert.equal(env.GITHUB_SERVER_URL, "https://github.com");
  assert.equal(env.GITHUB_WORKFLOW_REF, `${repository}/${workflowPath}@refs/heads/main`);
  assert.equal(env.GITHUB_WORKFLOW_SHA, env.GITHUB_SHA);
  assert.equal(env.RUNNER_ENVIRONMENT, "github-hosted");
  for (const key of ["GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT", "GITHUB_REPOSITORY_ID", "GITHUB_REPOSITORY_OWNER_ID", "REVIEW_RUN_ATTEMPT", "REVIEW_ARTIFACT_ID"]) assert.match(env[key], /^[1-9]\d*$/);
  assert.ok(env.ACTIONS_ID_TOKEN_REQUEST_URL && env.ACTIONS_ID_TOKEN_REQUEST_TOKEN, "Managed Actions OIDC access is required");
  for (const key of ["NODE_AUTH_TOKEN", "NPM_TOKEN", "NPM_ID_TOKEN", "SIGSTORE_ID_TOKEN"]) assert.ok(!env[key], "No supplied registry or alternate identity tokens allowed");
}

// No local mode, no CLI switch to supply an identity, and no registry uploader.
export async function signHandoff(reviewDirectory, destination, env = process.env) {
  checkSigningContext(env);
  assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), env.GITHUB_SHA);
  assert.equal(execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { encoding: "utf8" }).trim(), "", "Tracked signing source must be clean");
  const review = readReview(reviewDirectory, { version: env.EXPECTED_VERSION, sha256: env.EXPECTED_SHA256,
    sourceSha: env.GITHUB_SHA, reviewRunId: env.REVIEW_RUN_ID, reviewRunAttempt: env.REVIEW_RUN_ATTEMPT });
  const context = { runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT, reviewArtifactId: env.REVIEW_ARTIFACT_ID };
  const h = makeHandoff(review, context);
  mkdirSync(destination, { recursive: true });
  assert.equal(readdirSync(destination).length, 0, "Never overwrite a handoff");
  const statement = provenanceStatement(review, h, { repositoryId: env.GITHUB_REPOSITORY_ID, ownerId: env.GITHUB_REPOSITORY_OWNER_ID });
  // Recheck live workflow-enabled state and source/review bindings after setup,
  // right before Fulcio/Rekor. The variable gate remains a dispatch/job snapshot;
  // closing it alone does not cancel in-flight work (see owner close procedure).
  await checkReleaseBoundary(env);
  const bundle = await attest(Buffer.from(JSON.stringify(statement)), payloadType);
  const verified = await verifyProvenanceBundle(bundle, review, context);
  assert.deepEqual(verified.predicate.buildDefinition.internalParameters.lenslayer, h);
  // Copy the original bundle; no pack/build/tarball rewriting occurs here.
  cpSync(reviewDirectory, join(destination, "review"), { recursive: true });
  readReview(join(destination, "review"), { version: review.version, sha256: review.sha256, sourceSha: review.sourceSha });
  const bundleBytes = Buffer.from(`${JSON.stringify(bundle, null, 2)}\n`);
  const handoffBytes = Buffer.from(`${JSON.stringify(h, null, 2)}\n`);
  writeFileSync(join(destination, bundleFilename), bundleBytes, { flag: "wx" });
  writeFileSync(join(destination, handoffFilename), handoffBytes, { flag: "wx" });
  writeFileSync(join(destination, "SHA256SUMS"), `${digest(bundleBytes)}  ${bundleFilename}\n${digest(handoffBytes)}  ${handoffFilename}\n`, { flag: "wx" });
  console.log("Signed handoff only: NOT published or registry accepted.");
  return h;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 4, "Usage: sign-handoff.mjs REVIEW_DIRECTORY NEW_HANDOFF_DIRECTORY (approved Actions job only)");
  await signHandoff(resolve(process.argv[2]), resolve(process.argv[3]));
}
