// Owner-side GET/local-read preflight only. Never packs, signs, logs in or publishes.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { digest, repository } from "./artifact.mjs";
import { githubGet } from "./github-read.mjs";
import { readReview } from "./handoff.mjs";
import { checkCurrentMain, checkReviewRun, selectReviewArtifact } from "./release-policy.mjs";
import { verifyHandoff } from "./verify-handoff.mjs";

const checkout = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const reviewListing = "actions/workflows/sdk-release-review.yml/runs?event=workflow_dispatch&branch=main&per_page=100";
const reviewNames = (version) => [`lenslayer-agent-sdk-${version}.tgz`, "review.json", "pack.json", "SHA256SUMS"];
const hashes = (directory, names) => Object.fromEntries(names.map((name) => [name, digest(readFileSync(join(directory, name)))]));
export const shellQuote = (value) => `'${String(value).replace(/'/g, `'"'"'`)}'`;

export function checkCheckout(sourceSha, execute = execFileSync) {
  const git = (...args) => execute("git", args, { cwd: checkout, encoding: "utf8", timeout: 30000 }).trim();
  assert.equal(git("rev-parse", "HEAD"), sourceSha, "Use the exact reviewed main checkout");
  assert.equal(git("status", "--porcelain", "--untracked-files=no"), "", "Tracked checkout edits invalidate preflight");
  assert.equal(git("status", "--porcelain", "--untracked-files=normal", "--", "sdk", ".github/workflows"), "", "Unreviewed SDK/workflow files invalidate preflight");
  git("ls-files", "--error-unmatch", "sdk/scripts/release-preflight.mjs", "sdk/scripts/github-read.mjs");
}

function artifactRecord(artifact, now = Date.now()) {
  assert.equal(artifact.expired, false);
  assert.ok(Number.isSafeInteger(artifact.id) && artifact.id > 0);
  assert.match(artifact.digest, /^sha256:[a-f0-9]{64}$/, "GitHub artifact ZIP digest required");
  assert.ok(Date.parse(artifact.expires_at) > now, "Artifact expired or expiry unavailable");
  return { id: artifact.id, name: artifact.name, githubZipDigest: artifact.digest, expiresAt: artifact.expires_at };
}

// Dependencies are unit-test seams only; the executable has no offline/mock mode.
export async function reviewPreflight(directory, expected, { get = githubGet, sourceCheck = checkCheckout } = {}) {
  assert.match(expected.sourceSha, /^[a-f0-9]{40}$/, "Supply the independently observed main SHA");
  assert.match(expected.reviewRunId, /^[1-9]\d*$/);
  assert.match(expected.reviewRunAttempt, /^[1-9]\d*$/);
  assert.match(expected.sha256, /^[a-f0-9]{64}$/, "Supply the independently approved tarball hash");
  const review = readReview(directory, expected);
  sourceCheck(review.sourceSha);
  const env = { GITHUB_SHA: review.sourceSha, REVIEW_RUN_ID: expected.reviewRunId };
  const local = hashes(directory, reviewNames(expected.version));
  async function snapshot() {
    const [main, run, listing, latest] = await Promise.all([
      get("git/ref/heads/main"), get(`actions/runs/${expected.reviewRunId}`),
      get(`actions/runs/${expected.reviewRunId}/artifacts?per_page=100`), get(reviewListing),
    ]);
    checkCurrentMain(main, env);
    checkReviewRun(run, env);
    assert.equal(run.repository.private, false, "Public canonical repository required");
    assert.equal(run.head_repository.private, false);
    assert.equal(String(run.run_attempt), expected.reviewRunAttempt, "Review attempt changed");
    assert.equal(String(latest.workflow_runs[0].id), expected.reviewRunId, "Newer review dispatch superseded approval");
    assert.ok(Number.isSafeInteger(listing.total_count) && listing.total_count <= 100, "Artifact listing incomplete");
    assert.equal(listing.total_count, listing.artifacts.length);
    const id = selectReviewArtifact(listing.artifacts, env, run.run_attempt);
    const artifact = listing.artifacts.find((a) => a.id === id);
    assert.equal(String(artifact.workflow_run.id), expected.reviewRunId);
    return artifactRecord(artifact);
  }
  const artifact = await snapshot();
  assert.deepEqual(await snapshot(), artifact, "Review artifact changed during inspection");
  assert.deepEqual(readReview(directory, expected), review);
  assert.deepEqual(hashes(directory, reviewNames(expected.version)), local, "Local review changed during inspection");
  sourceCheck(review.sourceSha);
  return { repository, sourceSha: review.sourceSha, version: review.version, reviewRunId: review.runId,
    reviewRunAttempt: review.runAttempt, sha256: review.sha256, integrity: review.integrity,
    reviewArtifact: artifact, reviewFileSha256: local,
    artifactDigestScope: "GitHub-reported ZIP digest; not the tarball hash or a locally verified ZIP digest" };
}

export function ownerCommand(reviewDirectory, handoffDirectory, expected, source = checkout) {
  const args = [join(source, "sdk/scripts/release-preflight.mjs"), "bootstrap-check", reviewDirectory, handoffDirectory,
    expected.version, expected.sha256, expected.reviewRunId, expected.reviewRunAttempt, expected.runId, expected.runAttempt, expected.sourceSha];
  const check = `node ${args.map(shellQuote).join(" ")}`;
  return ["(", "  set -eu", `  cd ${shellQuote(source)}`,
    `  test "$(node --version)" = 'v24.15.0'`, `  test "$(npm --version)" = '11.12.1'`,
    `  ${check}`, "  npm login --auth-type=web --registry=https://registry.npmjs.org/",
    // Login/MFA can take time: repeat real cryptographic/live checks after it.
    `  ${check}`,
    `  npm publish ${shellQuote(join(handoffDirectory, "review", `lenslayer-agent-sdk-${expected.version}.tgz`))} --provenance-file=${shellQuote(join(handoffDirectory, "provenance.sigstore.json"))} --ignore-scripts --access public --tag latest --registry=https://registry.npmjs.org/`, ")"].join("\n");
}

export async function bootstrapPreflight(reviewDirectory, handoffDirectory, expected,
  { get = githubGet, sourceCheck = checkCheckout, verify = verifyHandoff } = {}) {
  assert.match(expected.runId, /^[1-9]\d*$/);
  assert.equal(expected.runAttempt, "1", "Fresh attempt-1 signing dispatch required");
  const original = realpathSync(reviewDirectory), handoff = realpathSync(handoffDirectory);
  assert.notEqual(original, realpathSync(join(handoff, "review")), "Keep the independently downloaded original review separately");
  const report = await reviewPreflight(original, expected, { get, sourceCheck });
  const names = reviewNames(expected.version);
  assert.deepEqual(hashes(join(handoff, "review"), names), report.reviewFileSha256, "Handoff must preserve all four original review files; never repack");
  const files = hashes(handoff, ["handoff.json", "provenance.sigstore.json", "SHA256SUMS"]);
  const listing = await get(`actions/runs/${expected.runId}/artifacts?per_page=100`);
  assert.ok(Number.isSafeInteger(listing.total_count) && listing.total_count <= 100, "Artifact listing incomplete");
  assert.equal(listing.total_count, listing.artifacts.length);
  // Real crypto, fresh TUF and managed gh policy checks; never trust sidecars alone.
  const verified = await verify(handoff, expected, { get });
  assert.equal(verified.sourceSha, report.sourceSha);
  assert.equal(verified.sha256, expected.sha256);
  const artifact = artifactRecord(listing.artifacts.find((a) => a.id === verified.artifactId));
  assert.equal(artifact.name, `sdk-bootstrap-${expected.version}-${report.sourceSha}-${expected.runId}-1`);
  assert.deepEqual(hashes(original, names), report.reviewFileSha256);
  assert.deepEqual(hashes(join(handoff, "review"), names), report.reviewFileSha256);
  assert.deepEqual(hashes(handoff, Object.keys(files)), files, "Handoff changed during verification");
  sourceCheck(report.sourceSha);
  return { ...report, signingRunId: expected.runId, signingRunAttempt: expected.runAttempt,
    handoffArtifact: artifact, handoffFileSha256: files,
    ownerTerminalCommand: ownerCommand(original, handoff, expected) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode, ...args] = process.argv.slice(2);
  assert.ok((mode === "review" && args.length === 6) || (["bootstrap", "bootstrap-check"].includes(mode) && args.length === 9),
    "Usage: release-preflight.mjs review REVIEW_DIR VERSION SHA256 REVIEW_RUN_ID REVIEW_ATTEMPT SOURCE_SHA | bootstrap[-check] REVIEW_DIR HANDOFF_DIR VERSION SHA256 REVIEW_RUN_ID REVIEW_ATTEMPT SIGNING_RUN_ID SIGNING_ATTEMPT SOURCE_SHA");
  const handoff = mode !== "review";
  const [directory, handoffDirectory, version, sha256, reviewRunId, reviewRunAttempt, runId, runAttempt, sourceSha] =
    handoff ? args : [args[0], undefined, ...args.slice(1, 5), undefined, undefined, args[5]];
  assert.match(sourceSha, /^[a-f0-9]{40}$/);
  const expected = { version, sha256, reviewRunId, reviewRunAttempt, runId, runAttempt, sourceSha };
  const result = handoff ? await bootstrapPreflight(directory, handoffDirectory, expected) : await reviewPreflight(realpathSync(directory), expected);
  if (mode === "bootstrap-check") delete result.ownerTerminalCommand;
  console.log(JSON.stringify({ status: "Point-in-time preflight only; NOT signed, published or registry accepted by this tool", checkedAt: new Date().toISOString(), ...result }, null, 2));
}
