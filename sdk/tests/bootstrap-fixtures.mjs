// Isolated local signature and metadata fixtures. NOT real Fulcio/Rekor/npm proof.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { sign, verify, X509Certificate } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { digest, inspectTarball, packageFiles, packageName, repository } from "../scripts/artifact.mjs";
import { bundleFilename, handoffFilename, handoffArtifactName, makeHandoff } from "../scripts/handoff.mjs";
import { payloadType, provenanceStatement, signerIdentity, signerIdentityPattern } from "../scripts/provenance.mjs";

export const pae = (type, payload) => Buffer.concat([Buffer.from(`DSSEv1 ${Buffer.byteLength(type)} ${type} ${payload.length} `), payload]);

export function bootstrapFixture() {
  const root = mkdtempSync(join(tmpdir(), "sdk-bootstrap-fixture-"));
  const sdk = fileURLToPath(new URL("..", import.meta.url));
  const directory = join(root, "handoff");
  const reviewDir = join(directory, "review");
  mkdirSync(reviewDir, { recursive: true });
  for (const file of packageFiles) {
    const path = join(root, "package", file);
    mkdirSync(dirname(path), { recursive: true });
    cpSync(join(sdk, file), path);
  }
  const pkg = JSON.parse(readFileSync(join(sdk, "package.json")));
  const filename = `lenslayer-agent-sdk-${pkg.version}.tgz`;
  const path = join(reviewDir, filename);
  execFileSync("tar", ["-czf", path, "-C", root, ...packageFiles.map((file) => `package/${file}`)]);
  const bytes = readFileSync(path);
  const review = { schema: 1, repository, name: packageName, version: pkg.version,
    sourceSha: "a".repeat(40), sourceRef: "refs/heads/main", sourceDirty: false,
    runId: "42", runAttempt: "2", filename, ...inspectTarball(path, pkg.version) };
  writeFileSync(join(reviewDir, "review.json"), JSON.stringify(review));
  writeFileSync(join(reviewDir, "pack.json"), JSON.stringify([{ name: packageName, version: pkg.version,
    filename, integrity: review.integrity, shasum: digest(bytes, "sha1"), files: packageFiles.map((path) => ({ path })) }]));
  writeFileSync(join(reviewDir, "SHA256SUMS"), `${review.sha256}  ${filename}\n`);
  const expected = { version: pkg.version, sha256: review.sha256, runId: "99", runAttempt: "1" };
  const h = makeHandoff(review, { ...expected, reviewArtifactId: "123" });
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(root, "key.pem"),
    "-out", join(root, "cert.pem"), "-days", "1", "-subj", "/CN=local-bootstrap-fixture",
    "-addext", `subjectAltName=URI:${signerIdentity}`], { stdio: "pipe" });
  const key = readFileSync(join(root, "key.pem"));
  const cert = new X509Certificate(readFileSync(join(root, "cert.pem")));
  const payload = Buffer.from(JSON.stringify(provenanceStatement(review, h, { repositoryId: "1", ownerId: "2" })));
  const bundle = { mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
    verificationMaterial: { certificate: { rawBytes: cert.raw.toString("base64") }, tlogEntries: [{ fixtureOnly: true }] },
    dsseEnvelope: { payloadType, payload: payload.toString("base64"), signatures: [{ keyid: "", sig: sign("sha256", pae(payloadType, payload), key).toString("base64") }] } };
  const save = () => {
    const bundleBytes = Buffer.from(JSON.stringify(bundle));
    const handoffBytes = Buffer.from(JSON.stringify(h));
    writeFileSync(join(directory, bundleFilename), bundleBytes);
    writeFileSync(join(directory, handoffFilename), handoffBytes);
    writeFileSync(join(directory, "SHA256SUMS"), `${digest(bundleBytes)}  ${bundleFilename}\n${digest(handoffBytes)}  ${handoffFilename}\n`);
  };
  save();
  const cryptoVerify = async (b, options) => {
    assert.equal(options.certificateIdentityURI, signerIdentityPattern);
    assert.equal(options.certificateIssuer, "https://token.actions.githubusercontent.com");
    assert.equal(b.verificationMaterial.certificate.rawBytes, cert.raw.toString("base64"), "Only fixture trust root accepted");
    const e = b.dsseEnvelope;
    assert.ok(verify("sha256", pae(e.payloadType, Buffer.from(e.payload, "base64")), cert.publicKey, Buffer.from(e.signatures[0].sig, "base64")), "Invalid actual DSSE fixture signature");
  };
  const run = { repository: { full_name: repository, private: false }, head_repository: { full_name: repository, private: false },
    id: 99, run_attempt: 1, path: ".github/workflows/sdk-publish.yml", event: "workflow_dispatch",
    head_branch: "main", head_sha: review.sourceSha, status: "completed", conclusion: "success",
    run_started_at: new Date(Date.parse(h.createdAt) - 1000).toISOString(), updated_at: new Date(Date.parse(h.createdAt) + 1000).toISOString() };
  const metadata = {
    "git/ref/heads/main": { ref: "refs/heads/main", object: { type: "commit", sha: review.sourceSha } },
    "actions/variables/SDK_NPM_PUBLISH_ENABLED": { name: "SDK_NPM_PUBLISH_ENABLED", value: "true" },
    "actions/workflows/sdk-publish.yml": { id: 5, path: ".github/workflows/sdk-publish.yml", state: "active" },
    "actions/runs/99": run,
    "actions/runs/42": { ...run, id: 42, run_attempt: 2, path: ".github/workflows/sdk-release-review.yml" },
    "actions/runs/42/artifacts?per_page=100": { total_count: 1, artifacts: [{ id: 123,
      name: `lenslayer-agent-sdk-${review.sourceSha}-2`, expired: false, workflow_run: { head_sha: review.sourceSha } }] },
    "actions/runs/99/artifacts?per_page=100": { total_count: 1, artifacts: [{ id: 456,
      name: handoffArtifactName(h), expired: false, workflow_run: { head_sha: review.sourceSha } }] },
    "actions/workflows/sdk-publish.yml/runs?event=workflow_dispatch&branch=main&per_page=100": { workflow_runs: [run] },
    "actions/workflows/sdk-release-review.yml/runs?event=workflow_dispatch&branch=main&per_page=100": { workflow_runs: [{ id: 42 }] },
    "actions/runs/99/approvals": [{ state: "approved", environments: [{ id: 7, name: "sdk-npm" }], user: { login: "udochukwu-echefu" } }],
    "environments/sdk-npm": { id: 7, name: "sdk-npm", deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
      protection_rules: [{ type: "required_reviewers", reviewers: [{ type: "User", reviewer: { login: "udochukwu-echefu" } }] }] },
    "environments/sdk-npm/deployment-branch-policies?per_page=100": { total_count: 1, branch_policies: [{ name: "main", type: "branch" }] },
    [`git/ref/tags/sdk-v${review.version}`]: { ref: `refs/tags/sdk-v${review.version}`, object: { type: "commit", sha: review.sourceSha } },
  };
  const get = async (resource) => { assert.ok(resource in metadata, `Unexpected GET: ${resource}`); return structuredClone(metadata[resource]); };
  const resign = (mutate) => {
    const statement = JSON.parse(Buffer.from(bundle.dsseEnvelope.payload, "base64").toString());
    mutate(statement);
    const payload = Buffer.from(JSON.stringify(statement));
    bundle.dsseEnvelope.payload = payload.toString("base64");
    bundle.dsseEnvelope.signatures[0].sig = sign("sha256", pae(payloadType, payload), key).toString("base64");
    save();
  };
  return { root, directory, reviewDir, review, expected, h, bundle, metadata, get, cryptoVerify, save, resign };
}
