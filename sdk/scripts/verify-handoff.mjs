import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readHandoff } from "./handoff.mjs";
import { verifyProvenanceBundle } from "./provenance.mjs";
import { checkLiveHandoff } from "./github-read.mjs";

// Dependency parameters are for offline tests, not CLI options. The executable
// has no mock/offline acceptance mode and never sets GITHUB_* or reads tokens.
export async function verifyHandoff(directory, expected, { get, verifySignature } = {}) {
  const { review, handoff, bundle } = readHandoff(directory, expected);
  const statement = await verifyProvenanceBundle(bundle, review, expected, verifySignature);
  assert.deepEqual(statement.predicate.buildDefinition.internalParameters.lenslayer, handoff, "Handoff metadata must be signed, not merely checksummed");
  const live = await checkLiveHandoff(handoff, review, get);
  // Re-read after network checks; fail on local changes during verification.
  assert.deepEqual(readHandoff(directory, expected), { review, handoff, bundle });
  return { version: review.version, sourceSha: review.sourceSha, sha256: review.sha256, integrity: review.integrity, ...live };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 7, "Usage: verify-handoff.mjs DIRECTORY VERSION TARBALL_SHA256 SIGNING_RUN_ID SIGNING_RUN_ATTEMPT");
  const [directory, version, sha256, runId, runAttempt] = process.argv.slice(2);
  assert.match(sha256, /^[a-f0-9]{64}$/);
  assert.match(runId, /^[1-9]\d*$/);
  assert.match(runAttempt, /^[1-9]\d*$/);
  const result = await verifyHandoff(resolve(directory), { version, sha256, runId, runAttempt });
  console.log(JSON.stringify({ status: "Verified signed handoff; NOT published or registry accepted", ...result }, null, 2));
}
