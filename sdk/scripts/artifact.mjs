import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export const repository = "udochukwu-echefu/lenslayer";
export const packageName = "@lenslayer/agent-sdk";
export const packageFiles = ["package.json", "README.md", "LICENSE", "CHANGELOG.md",
  ...["index", "client", "transport", "types", "errors", "events", "polling"].flatMap((name) => [`dist/${name}.js`, `dist/${name}.d.ts`])].sort();
export const digest = (bytes, algorithm = "sha256", encoding = "hex") => createHash(algorithm).update(bytes).digest(encoding);
export const integrity = (bytes) => `sha512-${digest(bytes, "sha512", "base64")}`;

export function checkMetadata(pkg, version) {
  assert.match(version, /^\d+\.\d+\.\d+$/); // Stable releases only; tags are sdk-v<version>.
  assert.equal(pkg.name, packageName);
  assert.equal(pkg.version, version);
  assert.equal(pkg.license, "MIT");
  assert.equal(pkg.type, "module");
  assert.equal(pkg.private, undefined);
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.repository.url, `git+https://github.com/${repository}.git`);
  assert.equal(pkg.repository.directory, "sdk");
  // Automatic generation and --provenance-file are mutually exclusive in npm.
  // Controlled publication must explicitly select one; never put false here.
  assert.deepEqual(pkg.publishConfig, { access: "public", registry: "https://registry.npmjs.org/" });
  assert.deepEqual(pkg.exports, { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } });
  assert.deepEqual([...pkg.files, "package.json", "README.md"].sort(), packageFiles);
}

/** Inspect the actual archive, not just npm's dry-run description. No extraction to disk. */
export function inspectTarball(path, version) {
  const files = execFileSync("tar", ["-tzf", path], { encoding: "utf8" }).trim().split("\n");
  assert.deepEqual(files.sort(), packageFiles.map((file) => `package/${file}`).sort());
  const entries = execFileSync("tar", ["-tvzf", path], { encoding: "utf8" }).trim().split("\n");
  assert.ok(entries.every((entry) => entry.startsWith("-")), "Only regular files are permitted");
  const content = new Map(packageFiles.map((file) => [file, execFileSync("tar", ["-xOzf", path, `package/${file}`], { encoding: "utf8" })]));
  for (const text of content.values()) assert.doesNotMatch(text, /ll_agent_[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9_-]{16,}/);
  assert.equal(digest(content.get("LICENSE")), "bb7b682e26fe6eeda7f55bde38f996ac5607b8479b64a00d5726b8182250fc0d", "Canonical SDK-only MIT license");
  checkMetadata(JSON.parse(content.get("package.json")), version);
  const bytes = readFileSync(path);
  return { sha256: digest(bytes), integrity: integrity(bytes), files: packageFiles };
}

export function checkBundle(manifest, pack, bytes, expected) {
  assert.equal(manifest.schema, 1);
  assert.equal(manifest.repository, repository);
  assert.equal(manifest.name, packageName);
  assert.equal(manifest.version, expected.version);
  assert.equal(manifest.sourceSha, expected.sourceSha);
  assert.match(manifest.sourceSha, /^[a-f0-9]{40}$/);
  assert.equal(manifest.sourceRef, "refs/heads/main");
  assert.equal(typeof manifest.sourceDirty, "boolean");
  if (expected.runId !== undefined) assert.equal(manifest.sourceDirty, false, "CI release source must be clean");
  assert.equal(manifest.filename, `lenslayer-agent-sdk-${expected.version}.tgz`);
  assert.equal(manifest.sha256, expected.sha256);
  assert.equal(manifest.sha256, digest(bytes));
  assert.equal(manifest.integrity, integrity(bytes));
  if (expected.runId !== undefined) assert.equal(manifest.runId, expected.runId);
  if (expected.runAttempt !== undefined) assert.equal(manifest.runAttempt, expected.runAttempt);
  assert.deepEqual(manifest.files, packageFiles);
  assert.equal(pack.length, 1);
  assert.equal(pack[0].name, packageName);
  assert.equal(pack[0].version, manifest.version);
  assert.equal(pack[0].filename, manifest.filename);
  assert.equal(pack[0].integrity, manifest.integrity);
  assert.equal(pack[0].shasum, digest(bytes, "sha1"));
  assert.deepEqual(pack[0].files.map((file) => file.path).sort(), packageFiles);
}
