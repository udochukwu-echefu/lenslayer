import assert from "node:assert/strict";
import { X509Certificate } from "node:crypto";
import { packageName, repository } from "./artifact.mjs";

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
export function checkSignatureAudit(audit, review) {
  assert.deepEqual(audit.invalid, []);
  assert.deepEqual(audit.missing, []);
  assert.equal(audit.verified.length, 1, "One registry-installed SDK with verified attestations is required");
  const verified = audit.verified[0];
  assert.equal(verified.name, packageName);
  assert.equal(verified.version, review.version);
  assert.equal(verified.registry, "https://registry.npmjs.org/");
  const provenance = verified.attestationBundles.filter((entry) => entry.predicateType === "https://slsa.dev/provenance/v1");
  assert.equal(provenance.length, 1, "A verified provenance attestation (not only publish attestation) is required");
  const material = provenance[0].bundle.verificationMaterial;
  const certificate = material.certificate?.rawBytes ?? material.x509CertificateChain?.certificates[0]?.rawBytes;
  const signer = new X509Certificate(Buffer.from(certificate, "base64"));
  assert.equal(signer.subjectAltName, `URI:https://github.com/${repository}/.github/workflows/sdk-publish.yml@refs/heads/main`,
    "Verified signing certificate must identify the canonical main publish workflow");
  const statement = JSON.parse(Buffer.from(provenance[0].bundle.dsseEnvelope.payload, "base64").toString("utf8"));
  assert.equal(statement._type, "https://in-toto.io/Statement/v1");
  assert.equal(statement.predicateType, provenance[0].predicateType);
  assert.deepEqual(statement.subject, [{ name: `pkg:npm/%40lenslayer/agent-sdk@${review.version}`,
    digest: { sha512: Buffer.from(review.integrity.slice("sha512-".length), "base64").toString("hex") } }]);
  const build = statement.predicate.buildDefinition;
  assert.equal(build.buildType, "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1");
  assert.deepEqual(build.externalParameters.workflow, {
    ref: "refs/heads/main", repository: `https://github.com/${repository}`, path: ".github/workflows/sdk-publish.yml",
  });
  assert.equal(build.internalParameters.github.event_name, "workflow_dispatch");
  assert.deepEqual(build.resolvedDependencies, [{ uri: `git+https://github.com/${repository}@refs/heads/main`, digest: { gitCommit: review.sourceSha } }]);
  assert.equal(statement.predicate.runDetails.builder.id, "https://github.com/actions/runner/github-hosted");
  assert.match(statement.predicate.runDetails.metadata.invocationId,
    /^https:\/\/github\.com\/udochukwu-echefu\/lenslayer\/actions\/runs\/[1-9]\d*\/attempts\/[1-9]\d*$/);
}
