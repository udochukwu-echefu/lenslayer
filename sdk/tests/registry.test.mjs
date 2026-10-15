import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { integrity, packageName, repository } from "../scripts/artifact.mjs";
import { checkRegistryInstall, checkRegistryPackage, checkSignatureAudit } from "../scripts/registry-check.mjs";

// Synthetic policy fixtures only: these are not signed and cannot establish
// registry, OIDC, Sigstore or live publication acceptance.
const review = { version: "0.1.0", sourceSha: "a".repeat(40), integrity: integrity(Buffer.from("fixture bytes")) };
const pkg = { name: packageName, version: review.version, dist: { integrity: review.integrity,
  tarball: "https://registry.npmjs.org/@lenslayer/agent-sdk/-/agent-sdk-0.1.0.tgz",
  signatures: [{ keyid: "fixture", sig: "fixture" }], attestations: { url: "https://registry.npmjs.org/-/npm/v1/attestations/fixture" } } };
const lock = { packages: { "": { dependencies: { [packageName]: review.version } }, [`node_modules/${packageName}`]: {
  version: review.version, integrity: review.integrity, resolved: pkg.dist.tarball,
} } };
// Self-signed test certificate exercises identity policy only. It is never
// submitted to npm/Sigstore and would not pass their cryptographic trust checks.
const directory = mkdtempSync(join(tmpdir(), "lenslayer-certificate-fixture-"));
let certificate, wrongCertificate;
try {
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(directory, "key.pem"),
    "-out", join(directory, "certificate.pem"), "-days", "1", "-subj", "/CN=SDK policy fixture",
    "-addext", `subjectAltName=URI:https://github.com/${repository}/.github/workflows/sdk-publish.yml@refs/heads/main`], { stdio: "pipe" });
  certificate = execFileSync("openssl", ["x509", "-in", join(directory, "certificate.pem"), "-outform", "DER"]).toString("base64");
  execFileSync("openssl", ["req", "-new", "-x509", "-key", join(directory, "key.pem"), "-out", join(directory, "other.pem"),
    "-days", "1", "-subj", "/CN=Wrong SDK policy fixture", "-addext", "subjectAltName=URI:https://github.com/other/fork/.github/workflows/sdk-publish.yml@refs/heads/main"], { stdio: "pipe" });
  wrongCertificate = execFileSync("openssl", ["x509", "-in", join(directory, "other.pem"), "-outform", "DER"]).toString("base64");
} finally { rmSync(directory, { recursive: true, force: true }); }
const statement = { _type: "https://in-toto.io/Statement/v1", predicateType: "https://slsa.dev/provenance/v1",
  subject: [{ name: "pkg:npm/%40lenslayer/agent-sdk@0.1.0", digest: { sha512: Buffer.from(review.integrity.slice(7), "base64").toString("hex") } }],
  predicate: { buildDefinition: {
    buildType: "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
    externalParameters: { workflow: { ref: "refs/heads/main", repository: `https://github.com/${repository}`, path: ".github/workflows/sdk-publish.yml" } },
    internalParameters: { github: { event_name: "workflow_dispatch" } },
    resolvedDependencies: [{ uri: `git+https://github.com/${repository}@refs/heads/main`, digest: { gitCommit: review.sourceSha } }],
  }, runDetails: { builder: { id: "https://github.com/actions/runner/github-hosted" },
    metadata: { invocationId: `https://github.com/${repository}/actions/runs/42/attempts/1` } } },
};
const audit = (payload = statement) => ({ invalid: [], missing: [], verified: [{ name: packageName, version: review.version,
  registry: "https://registry.npmjs.org/", attestationBundles: [{ predicateType: statement.predicateType,
    bundle: { mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
      verificationMaterial: { certificate: { rawBytes: certificate }, tlogEntries: [{ fixtureOnly: true }] },
      dsseEnvelope: { payloadType: "application/vnd.in-toto+json", payload: Buffer.from(JSON.stringify(payload)).toString("base64"),
        signatures: [{ keyid: "", sig: Buffer.from("synthetic-audit-policy-only").toString("base64") }] } } }] }] });

test("registry policy requires reviewed integrity, signature presence and canonical registry URLs", () => {
  checkRegistryPackage(pkg, review);
  for (const field of ["name", "version"]) assert.throws(() => checkRegistryPackage({ ...pkg, [field]: "other" }, review));
  for (const changes of [{ integrity: "sha512-other" }, { signatures: [] }, { attestations: {} },
    { tarball: "https://attacker.example.test/archive.tgz" }, { attestations: { url: "https://attacker.example.test/attestations" } }]) {
    assert.throws(() => checkRegistryPackage({ ...pkg, dist: { ...pkg.dist, ...changes } }, review));
  }
});

test("signature consumer must contain only the exact registry-installed SDK and reviewed integrity", () => {
  checkRegistryInstall(lock, review);
  for (const changes of [{ version: "9.0.0" }, { integrity: "sha512-other" }, { resolved: "file:local.tgz" }]) {
    const changed = structuredClone(lock);
    Object.assign(changed.packages[`node_modules/${packageName}`], changes);
    assert.throws(() => checkRegistryInstall(changed, review));
  }
  const extra = structuredClone(lock);
  extra.packages["node_modules/unexpected"] = {};
  assert.throws(() => checkRegistryInstall(extra, review));
});

test("audit policy rejects missing/invalid crypto results and absence of positive verified provenance", () => {
  checkSignatureAudit(audit(), review);
  for (const changes of [{ invalid: [{}] }, { missing: [{}] }, { verified: [] }, { verified: [audit().verified[0], audit().verified[0]] }]) {
    assert.throws(() => checkSignatureAudit({ ...audit(), ...changes }, review));
  }
  for (const changes of [{ name: "other" }, { version: "9.0.0" }, { registry: "https://attacker.example.test/" },
    { attestationBundles: [] }, { attestationBundles: [{ predicateType: "https://registry.npmjs.org/attestations/publish/v0.1" }] }]) {
    const changed = audit();
    Object.assign(changed.verified[0], changes);
    assert.throws(() => checkSignatureAudit(changed, review));
  }
  const missingCertificate = audit();
  missingCertificate.verified[0].attestationBundles[0].bundle.verificationMaterial = {};
  assert.throws(() => checkSignatureAudit(missingCertificate, review));
  const wrongSigner = audit();
  wrongSigner.verified[0].attestationBundles[0].bundle.verificationMaterial.certificate.rawBytes = wrongCertificate;
  assert.throws(() => checkSignatureAudit(wrongSigner, review), /signing certificate/);
  const legacyCertificate = audit();
  const legacyBundle = legacyCertificate.verified[0].attestationBundles[0].bundle;
  legacyBundle.mediaType = "application/vnd.dev.sigstore.bundle+json;version=0.2";
  legacyBundle.verificationMaterial = { x509CertificateChain: { certificates: [{ rawBytes: certificate }] }, tlogEntries: [{ fixtureOnly: true }] };
  checkSignatureAudit(legacyCertificate, review);
});

test("verified provenance policy binds package, bytes, canonical main commit, workflow and hosted builder", () => {
  const mutations = [
    (s) => { s.subject[0].digest.sha512 = "b".repeat(128); },
    (s) => { s.subject[0].name = "pkg:npm/other@0.1.0"; },
    (s) => { s.predicate.buildDefinition.externalParameters.workflow.repository = "https://github.com/other/fork"; },
    (s) => { s.predicate.buildDefinition.externalParameters.workflow.path = ".github/workflows/unreviewed.yml"; },
    (s) => { s.predicate.buildDefinition.externalParameters.workflow.ref = "refs/heads/feature"; },
    (s) => { s.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit = "b".repeat(40); },
    (s) => { s.predicate.buildDefinition.internalParameters.github.event_name = "push"; },
    (s) => { s.predicate.runDetails.builder.id = "https://github.com/actions/runner/self-hosted"; },
    (s) => { s.predicate.runDetails.metadata.invocationId = "https://github.com/other/fork/actions/runs/42/attempts/1"; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(statement);
    mutate(changed);
    assert.throws(() => checkSignatureAudit(audit(changed), review));
  }
});

test("registry provenance requires the exact expected signing invocation when supplied", () => {
  checkSignatureAudit(audit(), review, { runId: "42", runAttempt: "1" });
  assert.throws(() => checkSignatureAudit(audit(), review, { runId: "43", runAttempt: "1" }));
  assert.throws(() => checkSignatureAudit(audit(), review, { runId: "42", runAttempt: "2" }));
});

test("generic npm audit success cannot qualify ambiguous or version-confused certificate material", () => {
  const mutations = [
    (b) => { b.verificationMaterial.x509CertificateChain = { certificates: [{ rawBytes: wrongCertificate }] }; },
    (b) => { b.verificationMaterial.publicKey = { hint: "decoy" }; },
    (b) => { b.verificationMaterial.publicKey = null; },
    (b) => { b.verificationMaterial.x509CertificateChain = null; },
    (b) => { b.messageSignature = null; },
    (b) => { b.mediaType = "application/vnd.dev.sigstore.bundle+json;version=0.2"; },
    (b) => { b.mediaType += ";unvalidated-suffix"; },
    (b) => { b.verificationMaterial.certificate = null; },
  ];
  for (const mutate of mutations) {
    const value = audit();
    mutate(value.verified[0].attestationBundles[0].bundle);
    assert.throws(() => checkSignatureAudit(value, review));
  }
});
