import assert from "node:assert/strict";
import { packageName } from "./artifact.mjs";
import { checkProvenance } from "./provenance.mjs";

export function checkRegistryPackage(pkg, review) {
  assert.equal(pkg.name, packageName);
  assert.equal(pkg.version, review.version);
  assert.equal(pkg.dist.integrity, review.integrity);
  assert.ok(pkg.dist.signatures?.length, "Registry signatures are required, not just integrity");
  assert.equal(new URL(pkg.dist.attestations.url).origin, "https://registry.npmjs.org");
  assert.equal(new URL(pkg.dist.tarball).origin, "https://registry.npmjs.org");
}

export function checkRegistryInstall(lock, review) {
  assert.deepEqual(Object.keys(lock.packages).sort(), ["", `node_modules/${packageName}`]);
  assert.deepEqual(lock.packages[""].dependencies, { [packageName]: review.version });
  const installed = lock.packages[`node_modules/${packageName}`];
  assert.equal(installed.version, review.version);
  assert.equal(installed.integrity, review.integrity);
  assert.equal(new URL(installed.resolved).origin, "https://registry.npmjs.org");
}

// Call ONLY on successful `npm audit signatures --json --include-attestations`
// output. Parsing a DSSE payload alone is NOT cryptographic verification.
export function checkSignatureAudit(audit, review, expectedSigning) {
  assert.deepEqual(audit.invalid, []);
  assert.deepEqual(audit.missing, []);
  assert.equal(audit.verified.length, 1, "One registry-installed SDK with verified attestations is required");
  const verified = audit.verified[0];
  assert.equal(verified.name, packageName);
  assert.equal(verified.version, review.version);
  assert.equal(verified.registry, "https://registry.npmjs.org/");
  const provenance = verified.attestationBundles.filter((entry) => entry.predicateType === "https://slsa.dev/provenance/v1");
  assert.equal(provenance.length, 1, "A verified provenance attestation (not only publish attestation) is required");
  // npm's generic cryptographic audit retains raw JSON and does not enforce
  // LensLayer identity. Shared strict oneof/version validation in this policy
  // ensures its leaf is the SAME representation selected by the crypto parser.
  checkProvenance(provenance[0].bundle, review, expectedSigning);
}
