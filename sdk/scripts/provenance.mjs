import assert from "node:assert/strict";
import { X509Certificate } from "node:crypto";
import { repository } from "./artifact.mjs";

export const workflowPath = ".github/workflows/sdk-publish.yml";
export const signerIdentity = `https://github.com/${repository}/${workflowPath}@refs/heads/main`;
export const predicateType = "https://slsa.dev/provenance/v1";
export const payloadType = "application/vnd.in-toto+json";

export function exactIdentityPattern(identity) {
  assert.equal(typeof identity, "string");
  // Sigstore interprets its URI option as a JS regex, not a literal. The final
  // assertion also excludes JS `$`'s otherwise-permitted final line terminator.
  return `^${identity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$(?![\\s\\S])`;
}
export const signerIdentityPattern = exactIdentityPattern(signerIdentity);

const own = (value, key) => Object.hasOwn(value, key);
function object(value, label, keys) {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype, `${label} must be a raw JSON object`);
  assert.ok(Object.keys(value).every((key) => keys.includes(key)), `Unknown ${label} field`);
}
function base64(value, label) {
  assert.equal(typeof value, "string", `${label} must be base64 text`);
  assert.ok(value.length > 0 && Buffer.from(value, "base64").toString("base64") === value, `${label} must be nonempty canonical base64`);
  return Buffer.from(value, "base64");
}
function certificate(value) {
  object(value, "certificate", ["rawBytes"]);
  return new X509Certificate(base64(value.rawBytes, "certificate.rawBytes"));
}

// Validate RAW JSON before protobuf's fromJSON can silently select a oneof.
// Counts property presence, including null, rather than protobuf's isSet test.
// Registry audit returns raw bundles too: it must use this SAME selector before
// qualifying identity, even if npm already verified the generic signature.
export function validateProvenanceShape(bundle) {
  object(bundle, "bundle", ["mediaType", "verificationMaterial", "dsseEnvelope", "messageSignature"]);
  const legacy = bundle.mediaType === "application/vnd.dev.sigstore.bundle+json;version=0.2";
  assert.ok(legacy || ["application/vnd.dev.sigstore.bundle.v0.3+json", "application/vnd.dev.sigstore.bundle+json;version=0.3"].includes(bundle.mediaType), "Only exact v0.2/v0.3 bundle media types are supported");
  assert.deepEqual(["dsseEnvelope", "messageSignature"].filter((key) => own(bundle, key)), ["dsseEnvelope"], "Ambiguous or missing bundle-content oneof");
  const material = bundle.verificationMaterial;
  object(material, "verificationMaterial", ["publicKey", "certificate", "x509CertificateChain", "tlogEntries", "timestampVerificationData"]);
  const selected = ["publicKey", "x509CertificateChain", "certificate"].filter((key) => own(material, key));
  assert.equal(selected.length, 1, "Ambiguous or missing verification-material oneof");
  assert.equal(selected[0], legacy ? "x509CertificateChain" : "certificate", "Bundle version requires exactly its certificate representation; public-key hints are forbidden");
  let leaf;
  if (legacy) {
    object(material.x509CertificateChain, "x509CertificateChain", ["certificates"]);
    const chain = material.x509CertificateChain.certificates;
    assert.ok(Array.isArray(chain) && chain.length > 0, "Nonempty certificate chain required");
    // The pinned Sigstore parser and verifier both use certificates[0] as leaf.
    leaf = chain.map(certificate)[0];
  } else leaf = certificate(material.certificate);
  assert.ok(Array.isArray(material.tlogEntries) && material.tlogEntries.length > 0, "Transparency log proof is required");
  assert.ok(material.tlogEntries.every((entry) => entry !== null && typeof entry === "object" && !Array.isArray(entry)), "Malformed transparency log entry");
  if (own(material, "timestampVerificationData")) object(material.timestampVerificationData, "timestampVerificationData", ["rfc3161Timestamps"]);
  const envelope = bundle.dsseEnvelope;
  object(envelope, "dsseEnvelope", ["payloadType", "payload", "signatures"]);
  assert.equal(envelope.payloadType, payloadType);
  base64(envelope.payload, "DSSE payload");
  assert.ok(Array.isArray(envelope.signatures) && envelope.signatures.length === 1, "One real DSSE signature is required");
  object(envelope.signatures[0], "DSSE signature", ["keyid", "sig"]);
  assert.ok(!own(envelope.signatures[0], "keyid") || envelope.signatures[0].keyid === "", "Certificate signatures must not select an external key hint");
  base64(envelope.signatures[0].sig, "DSSE signature");
  return leaf;
}

export function invocation(runId, runAttempt) {
  assert.match(String(runId), /^[1-9]\d*$/);
  assert.match(String(runAttempt), /^[1-9]\d*$/);
  return `https://github.com/${repository}/actions/runs/${runId}/attempts/${runAttempt}`;
}

export function provenanceStatement(review, signing, github) {
  // Same npm GitHub SLSA shape as npm@11.12.1's official provenance helper.
  // No fabricated CI identity: sign-handoff checks the actual Actions context.
  return {
    _type: "https://in-toto.io/Statement/v1",
    subject: [{ name: `pkg:npm/%40lenslayer/agent-sdk@${review.version}`,
      digest: { sha512: Buffer.from(review.integrity.slice(7), "base64").toString("hex") } }],
    predicateType,
    predicate: {
      buildDefinition: {
        buildType: "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
        externalParameters: { workflow: { ref: "refs/heads/main", repository: `https://github.com/${repository}`, path: workflowPath } },
        internalParameters: { github: { event_name: "workflow_dispatch", repository_id: github.repositoryId,
          repository_owner_id: github.ownerId }, lenslayer: signing },
        resolvedDependencies: [{ uri: `git+https://github.com/${repository}@refs/heads/main`, digest: { gitCommit: review.sourceSha } }],
      },
      runDetails: { builder: { id: "https://github.com/actions/runner/github-hosted" },
        metadata: { invocationId: invocation(signing.signingRunId, signing.signingRunAttempt) } },
    },
  };
}

// This policy MUST only run after cryptographic verification, never as a
// substitute for it. Registry audit callers have already verified the bundle.
export function checkProvenance(bundle, review, expectedSigning) {
  const signer = validateProvenanceShape(bundle);
  assert.equal(signer.subjectAltName, `URI:${signerIdentity}`, "Verified signing certificate must identify the canonical main publish workflow");
  const statement = JSON.parse(Buffer.from(bundle.dsseEnvelope.payload, "base64").toString("utf8"));
  assert.equal(statement._type, "https://in-toto.io/Statement/v1");
  assert.equal(statement.predicateType, predicateType);
  assert.deepEqual(statement.subject, [{ name: `pkg:npm/%40lenslayer/agent-sdk@${review.version}`,
    digest: { sha512: Buffer.from(review.integrity.slice(7), "base64").toString("hex") } }]);
  const build = statement.predicate.buildDefinition;
  assert.equal(build.buildType, "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1");
  assert.deepEqual(build.externalParameters.workflow, {
    ref: "refs/heads/main", repository: `https://github.com/${repository}`, path: workflowPath,
  });
  assert.equal(build.internalParameters.github.event_name, "workflow_dispatch");
  assert.deepEqual(build.resolvedDependencies, [{ uri: `git+https://github.com/${repository}@refs/heads/main`, digest: { gitCommit: review.sourceSha } }]);
  assert.equal(statement.predicate.runDetails.builder.id, "https://github.com/actions/runner/github-hosted");
  const actualInvocation = statement.predicate.runDetails.metadata.invocationId;
  assert.match(actualInvocation, /^https:\/\/github\.com\/udochukwu-echefu\/lenslayer\/actions\/runs\/[1-9]\d*\/attempts\/[1-9]\d*$/);
  if (expectedSigning) assert.equal(actualInvocation, invocation(expectedSigning.runId, expectedSigning.runAttempt), "Wrong signing run/attempt");
  return statement;
}

export async function verifyProvenanceBundle(bundle, review, signing,
  verifySignature = async (value, options) => (await import("sigstore")).verify(value, options)) {
  validateProvenanceShape(bundle); // Reject ambiguity BEFORE any crypto/identity qualification.
  await verifySignature(bundle, { certificateIssuer: "https://token.actions.githubusercontent.com",
    certificateIdentityURI: signerIdentityPattern });
  return checkProvenance(bundle, review, signing);
}
