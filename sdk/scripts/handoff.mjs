import assert from "node:assert/strict";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { checkBundle, digest, inspectTarball, packageName, repository } from "./artifact.mjs";
import { invocation } from "./provenance.mjs";

export const handoffLifetimeMs = 24 * 60 * 60 * 1000;
export const bundleFilename = "provenance.sigstore.json";
export const handoffFilename = "handoff.json";
export const reviewFilename = (version) => `lenslayer-agent-sdk-${version}.tgz`;
export const handoffArtifactName = (h) => `sdk-bootstrap-${h.version}-${h.sourceSha}-${h.signingRunId}-${h.signingRunAttempt}`;

export function regularDirectory(directory, names) {
  assert.ok(lstatSync(directory).isDirectory() && !lstatSync(directory).isSymbolicLink(), "Real directory required");
  assert.deepEqual(readdirSync(directory).sort(), [...names].sort(), "Unexpected or missing handoff files");
  for (const name of names) assert.equal(lstatSync(join(directory, name)).isSymbolicLink(), false, "No symlinks in handoff");
}

export function readReview(directory, expected) {
  assert.match(expected.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  const filename = reviewFilename(expected.version);
  regularDirectory(directory, [filename, "review.json", "pack.json", "SHA256SUMS"]);
  for (const name of readdirSync(directory)) assert.ok(lstatSync(join(directory, name)).isFile());
  const review = JSON.parse(readFileSync(join(directory, "review.json")));
  const bytes = readFileSync(join(directory, filename));
  assert.match(review.runId, /^[1-9]\d*$/);
  assert.match(review.runAttempt, /^[1-9]\d*$/);
  checkBundle(review, JSON.parse(readFileSync(join(directory, "pack.json"))), bytes, {
    version: expected.version, sha256: expected.sha256, sourceSha: expected.sourceSha || review.sourceSha,
    runId: expected.reviewRunId || review.runId, runAttempt: expected.reviewRunAttempt || review.runAttempt,
  });
  assert.equal(readFileSync(join(directory, "SHA256SUMS"), "utf8"), `${review.sha256}  ${filename}\n`);
  assert.deepEqual(inspectTarball(join(directory, filename), expected.version), {
    sha256: review.sha256, integrity: review.integrity, files: review.files,
  });
  return review;
}

export function makeHandoff(review, context, now = Date.now()) {
  // publishEnabled records the necessary job snapshot, never a live-variable
  // observation. Owner verification separately samples the live flag via gh.
  const h = { schema: 1, operation: "detached-provenance", publishEnabled: true,
    repository, name: packageName, version: review.version, sourceSha: review.sourceSha,
    sha256: review.sha256, integrity: review.integrity,
    reviewRunId: review.runId, reviewRunAttempt: review.runAttempt,
    reviewArtifactId: context.reviewArtifactId,
    signingRunId: context.runId, signingRunAttempt: context.runAttempt,
    createdAt: new Date(now).toISOString(), expiresAt: new Date(now + handoffLifetimeMs).toISOString() };
  checkHandoff(h, review, context, now);
  return h;
}

export function checkHandoff(h, review, expected, now = Date.now()) {
  assert.deepEqual(Object.keys(h).sort(), ["schema", "operation", "publishEnabled", "repository", "name", "version", "sourceSha",
    "sha256", "integrity", "reviewRunId", "reviewRunAttempt", "reviewArtifactId", "signingRunId", "signingRunAttempt", "createdAt", "expiresAt"].sort());
  assert.equal(h.schema, 1);
  assert.equal(h.operation, "detached-provenance");
  assert.equal(h.publishEnabled, true, "Signing-job enable snapshot is mandatory (not a live variable observation)");
  assert.equal(h.repository, repository);
  assert.equal(h.name, packageName);
  for (const key of ["version", "sourceSha", "sha256", "integrity"]) assert.equal(h[key], review[key]);
  assert.equal(h.reviewRunId, review.runId);
  assert.equal(h.reviewRunAttempt, review.runAttempt);
  assert.match(h.reviewArtifactId, /^[1-9]\d*$/);
  assert.equal(h.signingRunId, expected.runId);
  assert.equal(h.signingRunAttempt, expected.runAttempt);
  assert.equal(h.signingRunAttempt, "1", "Only attempt-1 handoffs are allowed; dispatch a fresh signing run after any rerun");
  invocation(h.signingRunId, h.signingRunAttempt);
  const created = Date.parse(h.createdAt), expires = Date.parse(h.expiresAt);
  assert.ok(Number.isFinite(created) && Number.isFinite(expires));
  assert.equal(new Date(created).toISOString(), h.createdAt);
  assert.equal(new Date(expires).toISOString(), h.expiresAt);
  assert.equal(expires - created, handoffLifetimeMs);
  assert.ok(created <= now + 5 * 60 * 1000 && now < expires, "Handoff expired or future-dated; obtain renewed approval");
}

export function readHandoff(directory, expected) {
  regularDirectory(directory, ["review", handoffFilename, bundleFilename, "SHA256SUMS"]);
  for (const name of [handoffFilename, bundleFilename, "SHA256SUMS"]) assert.ok(lstatSync(join(directory, name)).isFile());
  const review = readReview(join(directory, "review"), expected);
  const h = JSON.parse(readFileSync(join(directory, handoffFilename)));
  checkHandoff(h, review, expected);
  const bundleBytes = readFileSync(join(directory, bundleFilename));
  const checksums = `${digest(bundleBytes)}  ${bundleFilename}\n${digest(readFileSync(join(directory, handoffFilename)))}  ${handoffFilename}\n`;
  assert.equal(readFileSync(join(directory, "SHA256SUMS"), "utf8"), checksums);
  return { review, handoff: h, bundle: JSON.parse(bundleBytes) };
}
