import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync, rmSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import { dirname, join } from "node:path";
import { checkProvenance, exactIdentityPattern, signerIdentity, signerIdentityPattern, validateProvenanceShape, verifyProvenanceBundle } from "../scripts/provenance.mjs";
import { checkSignatureAudit } from "../scripts/registry-check.mjs";
import { bootstrapFixture } from "./bootstrap-fixtures.mjs";

// Historical OFFICIAL public fixture, not a LensLayer release or test signature:
// https://github.com/sigstore/sigstore-js/blob/769a53d8713248a8bf49edfc2a5d1955b0dcc24d/tests/bundles/bundleV03-dsse.sigstore
// Apache-2.0, Copyright The Sigstore Authors. Formatting differs; content matches.
// Offline test changes ONLY trust-root retrieval to the pinned package's public
// seed. No crypto, certificate, CT, Rekor or signature verification is mocked.
// This does NOT test production TUF freshness/network retrieval or live signing.
const require = createRequire(import.meta.url);
const tuf = require("@sigstore/tuf");
const seeds = JSON.parse(readFileSync(join(dirname(require.resolve("@sigstore/tuf")), "..", "seeds.json")));
const rootJSON = JSON.parse(Buffer.from(seeds["https://tuf-repo-cdn.sigstore.dev"].targets["trusted_root.json"], "base64"));
const { TrustedRoot } = require("@sigstore/protobuf-specs");
const bundle = JSON.parse(readFileSync(new URL("official-sigstore.fixture.json", import.meta.url)));

test("official Sigstore public historical bundle verifies offline; tampering and wrong SDK identity fail real library crypto/policy", async () => {
  const original = tuf.getTrustedRoot;
  try {
    tuf.getTrustedRoot = async () => TrustedRoot.fromJSON(rootJSON);
    const { verify } = await import("sigstore");
    await verify(bundle);
    const corrupted = structuredClone(bundle);
    corrupted.dsseEnvelope.signatures[0].sig = Buffer.alloc(72).toString("base64");
    await assert.rejects(verify(corrupted));
    const corruptedLog = structuredClone(bundle);
    corruptedLog.verificationMaterial.tlogEntries[0].inclusionPromise.signedEntryTimestamp = Buffer.alloc(72).toString("base64");
    await assert.rejects(verify(corruptedLog));
    await assert.rejects(verify(bundle, { certificateIdentityURI: "https://github.com/udochukwu-echefu/lenslayer/.github/workflows/sdk-publish.yml@refs/heads/main" }));
    // Default production function, no injected signature-verification callback.
    await assert.rejects(verifyProvenanceBundle(bundle, { version: "0.1.0", sourceSha: "a".repeat(40), integrity: "sha512-placeholder" }, { runId: "99", runAttempt: "1" }));
  } finally { tuf.getTrustedRoot = original; }
});

test("real historical Sigstore verification selects the chain in a dual-material v0.2 bundle; both candidate qualification paths reject it", async () => {
  const original = tuf.getTrustedRoot;
  const f = bootstrapFixture();
  try {
    tuf.getTrustedRoot = async () => TrustedRoot.fromJSON(rootJSON);
    const { verify } = await import("sigstore");
    const legacy = structuredClone(bundle);
    legacy.mediaType = "application/vnd.dev.sigstore.bundle+json;version=0.2";
    const realCertificate = legacy.verificationMaterial.certificate;
    legacy.verificationMaterial.x509CertificateChain = { certificates: [realCertificate] };
    delete legacy.verificationMaterial.certificate;
    const actualSigner = await verify(legacy);
    const actualSAN = new X509Certificate(Buffer.from(realCertificate.rawBytes, "base64")).subjectAltName.replace(/^[^:]+:/, "");
    assert.equal(actualSigner.identity.subjectAlternativeName, actualSAN);
    assert.equal(validateProvenanceShape(legacy).subjectAltName.replace(/^[^:]+:/, ""), actualSAN);

    const mixed = structuredClone(legacy);
    mixed.verificationMaterial.certificate = f.bundle.verificationMaterial.certificate;
    const ignoredDecoy = await verify(mixed); // Real library reproduction, not qualification.
    assert.equal(ignoredDecoy.identity.subjectAlternativeName, actualSAN);
    assert.notEqual(actualSAN, signerIdentity);
    assert.equal(require("@sigstore/bundle").bundleFromJSON(mixed).verificationMaterial.content.$case, "x509CertificateChain");
    // Candidate rejects before calling even this actual-crypto callback.
    let calls = 0;
    await assert.rejects(verifyProvenanceBundle(mixed, f.review, f.expected, async (...args) => { calls++; return verify(...args); }), /oneof/);
    assert.equal(calls, 0);
    assert.throws(() => checkProvenance(mixed, f.review, f.expected), /oneof/);
    // npm's generic audit may have verified the historical chain already. Its
    // retained raw dual-material bundle still MUST NOT qualify SDK identity.
    assert.throws(() => checkSignatureAudit({ invalid: [], missing: [], verified: [{ name: "@lenslayer/agent-sdk",
      version: f.review.version, registry: "https://registry.npmjs.org/", attestationBundles: [{
        predicateType: "https://slsa.dev/provenance/v1", bundle: mixed }] }] }, f.review, f.expected), /oneof/);
    // Separately: canonical-looking semantic payload + decoy was the original
    // post-audit exploit probe, NOT a claim the changed payload has a real signature.
    const semanticProbe = structuredClone(f.bundle);
    semanticProbe.mediaType = mixed.mediaType;
    semanticProbe.verificationMaterial = structuredClone(mixed.verificationMaterial);
    assert.throws(() => checkProvenance(semanticProbe, f.review, f.expected), /oneof/);
  } finally { tuf.getTrustedRoot = original; rmSync(f.root, { recursive: true, force: true }); }
});

test("real historical Sigstore API rejects suffix identity with escaped anchored options; canonical-main suffix fails the pinned policy matcher", async () => {
  const original = tuf.getTrustedRoot;
  try {
    tuf.getTrustedRoot = async () => TrustedRoot.fromJSON(rootJSON);
    const { verify } = await import("sigstore");
    const actualSigner = await verify(bundle);
    const actualIdentity = actualSigner.identity.subjectAlternativeName;
    // Historical certificate has a foreign email SAN. A shortened expected
    // identity demonstrates the real API's substring/suffix behavior without
    // forging a canonical GitHub suffix certificate or touching live Fulcio.
    const prefix = actualIdentity.slice(0, -1);
    await verify(bundle, { certificateIdentityURI: prefix });
    await assert.rejects(verify(bundle, { certificateIdentityURI: exactIdentityPattern(prefix) }), /identity/);
    await verify(bundle, { certificateIdentityURI: exactIdentityPattern(actualIdentity) });
    const { verifySubjectAlternativeName } = require(join(dirname(require.resolve("@sigstore/verify")), "policy.js"));
    verifySubjectAlternativeName(signerIdentity, `${signerIdentity}-unapproved`); // Original unsafe option.
    verifySubjectAlternativeName(signerIdentityPattern, signerIdentity);
    for (const wrong of [`${signerIdentity}-unapproved`, `${signerIdentity}\n`, `prefix${signerIdentity}`,
      signerIdentity.replace("github.com", "githubXcom"), signerIdentity.replace("/.github/", "/Xgithub/")]) {
      assert.throws(() => verifySubjectAlternativeName(signerIdentityPattern, wrong), /identity/);
    }
    let optionsSeen;
    await assert.rejects(verifyProvenanceBundle(bundle, { version: "0.1.0", sourceSha: "a".repeat(40), integrity: "sha512-placeholder" },
      { runId: "99", runAttempt: "1" }, async (b, options) => { optionsSeen = options; return verify(b, options); }), /identity|extension/);
    assert.equal(optionsSeen.certificateIdentityURI, signerIdentityPattern);
  } finally { tuf.getTrustedRoot = original; }
});
