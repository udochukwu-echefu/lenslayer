import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test("release CLI packs/verifies actual bytes and rejects a changed expected hash, source, version or archive", { timeout: 30000 }, () => {
  const script = fileURLToPath(new URL("../scripts/release-artifact.mjs", import.meta.url));
  const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url))).version;
  const root = mkdtempSync(join(tmpdir(), "lenslayer-release-cli-"));
  const bundle = join(root, "bundle");
  // This test creates a local review, not a CI release attestation, even inside Actions.
  const env = { ...process.env, GITHUB_ACTIONS: "false", GITHUB_REF: "refs/heads/main", GITHUB_RUN_ID: "local", GITHUB_RUN_ATTEMPT: "local", EXPECTED_VERSION: version };
  for (const key of ["GITHUB_SHA", "REVIEW_RUN_ID", "REVIEW_RUN_ATTEMPT", "EXPECTED_SHA256"]) delete env[key];
  const run = (mode, changes = {}) => execFileSync(process.execPath, [script, mode, bundle], { env: { ...env, ...changes }, stdio: "pipe", encoding: "utf8" });
  try {
    run("pack");
    const manifest = JSON.parse(readFileSync(join(bundle, "review.json")));
    assert.equal(manifest.version, version);
    assert.match(manifest.sha256, /^[a-f0-9]{64}$/);
    assert.match(manifest.integrity, /^sha512-/);
    run("verify", { EXPECTED_SHA256: manifest.sha256 });
    assert.throws(() => run("pack"), "Never overwrite an existing review bundle");
    assert.throws(() => run("verify", { EXPECTED_SHA256: "b".repeat(64) }));
    assert.throws(() => run("verify", { GITHUB_SHA: "b".repeat(40) }));
    assert.throws(() => run("verify", { EXPECTED_VERSION: "99.0.0" }));
    const archive = join(bundle, manifest.filename);
    const bytes = readFileSync(archive);
    bytes[bytes.length - 1] ^= 1;
    writeFileSync(archive, bytes);
    assert.throws(() => run("verify", { EXPECTED_SHA256: manifest.sha256 }));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
