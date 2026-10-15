import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test("release CLI packs/verifies actual bytes and rejects a changed expected hash, source, version or archive", { timeout: 30000 }, () => {
  const sdk = fileURLToPath(new URL("..", import.meta.url));
  const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url))).version;
  const root = mkdtempSync(join(tmpdir(), "lenslayer-release-cli-"));
  const bundle = join(root, "bundle");
  const source = join(root, "source");
  const fixtureSdk = join(source, "sdk");
  mkdirSync(fixtureSdk, { recursive: true });
  for (const file of ["src", "scripts", "package.json", "package-lock.json", "tsconfig.json", "README.md", "LICENSE", "CHANGELOG.md", ".gitignore"]) {
    cpSync(join(sdk, file), join(fixtureSdk, file), { recursive: true });
  }
  symlinkSync(join(sdk, "node_modules"), join(fixtureSdk, "node_modules"), "dir");
  // Own disposable repository: this test must not depend on, or modify, the
  // caller's Git metadata (source-only audit copies may have no .git at all).
  const git = (...args) => execFileSync("git", args, { cwd: source, stdio: "pipe", encoding: "utf8" });
  git("init", "--initial-branch=main");
  git("add", "sdk");
  git("-c", "user.name=SDK fixture", "-c", "user.email=fixture@example.test", "-c", "commit.gpgsign=false", "commit", "-m", "SDK fixture");
  const script = join(fixtureSdk, "scripts/release-artifact.mjs");
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
    assert.equal(manifest.sourceDirty, false);
    assert.equal(manifest.sourceSha, git("rev-parse", "HEAD").trim());
    run("verify", { EXPECTED_SHA256: manifest.sha256 });
    assert.throws(() => run("verify", { REVIEW_RUN_ID: "42", REVIEW_RUN_ATTEMPT: "1" }), "Local bundles are never CI reviews");
    assert.throws(() => run("pack"), "Never overwrite an existing review bundle");
    assert.throws(() => run("verify", { EXPECTED_SHA256: "b".repeat(64) }));
    assert.throws(() => run("verify", { GITHUB_SHA: "b".repeat(40) }));
    assert.throws(() => run("verify", { EXPECTED_VERSION: "99.0.0" }));
    const archive = join(bundle, manifest.filename);
    const bytes = readFileSync(archive);
    bytes[bytes.length - 1] ^= 1;
    writeFileSync(archive, bytes);
    assert.throws(() => run("verify", { EXPECTED_SHA256: manifest.sha256 }));
    writeFileSync(join(fixtureSdk, "README.md"), `${readFileSync(join(fixtureSdk, "README.md"), "utf8")}\nUnreviewed fixture edit.\n`);
    assert.throws(() => execFileSync(process.execPath, [script, "pack", join(root, "dirty")], {
      env: { ...env, GITHUB_ACTIONS: "true" }, stdio: "pipe",
    }), (error) => /Release checks must not modify tracked source/.test(String(error.stderr)), "CI must reject dirty tracked source");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
