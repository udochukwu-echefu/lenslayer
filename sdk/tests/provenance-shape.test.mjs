import assert from "node:assert/strict";
import { test } from "node:test";
import { rmSync } from "node:fs";
import { bootstrapFixture } from "./bootstrap-fixtures.mjs";
import { validateProvenanceShape, verifyProvenanceBundle } from "../scripts/provenance.mjs";

test("raw signer/content oneofs reject duplicates including null before calling any verifier", async () => {
  const f = bootstrapFixture();
  try {
    const mediaTypes = ["application/vnd.dev.sigstore.bundle.v0.3+json",
      "application/vnd.dev.sigstore.bundle+json;version=0.3", "application/vnd.dev.sigstore.bundle+json;version=0.2"];
    for (const mediaType of mediaTypes) {
      const b = structuredClone(f.bundle);
      b.mediaType = mediaType;
      if (mediaType.endsWith("=0.2")) {
        b.verificationMaterial.x509CertificateChain = { certificates: [b.verificationMaterial.certificate] };
        delete b.verificationMaterial.certificate;
      }
      assert.ok(validateProvenanceShape(b).subjectAltName.includes("sdk-publish.yml"));
      const selected = mediaType.endsWith("=0.2") ? "x509CertificateChain" : "certificate";
      for (const other of ["certificate", "x509CertificateChain", "publicKey"].filter((key) => key !== selected)) {
        for (const value of [null, {}, { rawBytes: "" }, { hint: "untrusted" }, { certificates: [f.bundle.verificationMaterial.certificate] }]) {
          const mixed = structuredClone(b);
          mixed.verificationMaterial[other] = value;
          let calls = 0;
          await assert.rejects(verifyProvenanceBundle(mixed, f.review, f.expected, async () => { calls++; }), /oneof/);
          assert.equal(calls, 0, "Protobuf must not get an opportunity to choose a different signer");
        }
      }
      for (const messageSignature of [null, {}, { signature: "ZGVjb3k=" }]) {
        const mixed = structuredClone(b);
        mixed.messageSignature = messageSignature;
        let calls = 0;
        await assert.rejects(verifyProvenanceBundle(mixed, f.review, f.expected, async () => { calls++; }), /oneof/);
        assert.equal(calls, 0);
      }
    }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("raw JSON type/coercion and exact media-version boundaries are fail-closed", async () => {
  const f = bootstrapFixture();
  try {
    const mutations = [
      (b) => { b.mediaType = null; }, (b) => { b.mediaType = {}; }, (b) => { delete b.mediaType; },
      (b) => { b.mediaType = "application/vnd.dev.sigstore.bundle+json;version=0.1"; },
      (b) => { b.mediaType = "application/vnd.dev.sigstore.bundle+json;version=0.2"; },
      (b) => { b.mediaType = "application/vnd.dev.sigstore.bundle.v9.9+json"; },
      (b) => { b.mediaType += "\nignored"; },
      (b) => { b.verificationMaterial = null; }, (b) => { b.verificationMaterial = []; },
      (b) => { b.verificationMaterial.certificate = null; },
      (b) => { b.verificationMaterial.certificate = []; },
      (b) => { b.verificationMaterial.certificate.rawBytes = 123; },
      (b) => { b.verificationMaterial.certificate.rawBytes = "***"; },
      (b) => { b.verificationMaterial.certificate.rawBytes = "ZGVjb3k="; },
      (b) => { b.verificationMaterial.certificate.extra = "not canonical"; },
      (b) => { b.verificationMaterial.timestampVerificationData = null; },
      (b) => { b.verificationMaterial.tlogEntries = [null]; },
      (b) => { delete b.verificationMaterial.certificate; b.verificationMaterial.publicKey = { hint: "not a cert" }; },
      (b) => { delete b.verificationMaterial.certificate; b.verificationMaterial.x509CertificateChain = { certificates: [] }; },
      (b) => { b.mediaType = "application/vnd.dev.sigstore.bundle+json;version=0.2";
        delete b.verificationMaterial.certificate; b.verificationMaterial.x509CertificateChain = null; },
      (b) => { b.dsseEnvelope = null; }, (b) => { b.dsseEnvelope = []; },
      (b) => { b.dsseEnvelope.payload = 123; }, (b) => { b.dsseEnvelope.signatures = {}; },
      (b) => { b.dsseEnvelope.signatures = [null]; }, (b) => { b.dsseEnvelope.signatures[0].sig = false; },
      (b) => { b.dsseEnvelope.signatures[0].keyid = "unverified-key-hint"; },
      (b) => { b.content = { $case: "messageSignature" }; },
    ];
    for (const mutate of mutations) {
      const b = structuredClone(f.bundle);
      mutate(b);
      let calls = 0;
      await assert.rejects(verifyProvenanceBundle(b, f.review, f.expected, async () => { calls++; }));
      assert.equal(calls, 0);
    }
    for (const chain of [null, [], {}, { certificates: null }, { certificates: {} }, { certificates: [] },
      { certificates: [null] }, { certificates: [{ rawBytes: false }] }, { certificates: [{ rawBytes: "***" }] }]) {
      const b = structuredClone(f.bundle);
      b.mediaType = "application/vnd.dev.sigstore.bundle+json;version=0.2";
      delete b.verificationMaterial.certificate;
      b.verificationMaterial.x509CertificateChain = chain;
      let calls = 0;
      await assert.rejects(verifyProvenanceBundle(b, f.review, f.expected, async () => { calls++; }));
      assert.equal(calls, 0);
    }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
