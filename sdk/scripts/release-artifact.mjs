import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBundle, inspectTarball, packageName, repository } from "./artifact.mjs";

const sdk = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [mode, destination] = process.argv.slice(2);
assert.ok(["pack", "verify"].includes(mode) && destination, "Usage: node sdk/scripts/release-artifact.mjs pack|verify DIRECTORY");
const directory = resolve(destination);
const pkg = JSON.parse(readFileSync(join(sdk, "package.json")));
const version = process.env.EXPECTED_VERSION || pkg.version;
assert.equal(version, pkg.version);
const sourceSha = process.env.GITHUB_SHA || execFileSync("git", ["rev-parse", "HEAD"], { cwd: sdk, encoding: "utf8" }).trim();
if (mode === "pack") {
  mkdirSync(directory, { recursive: true });
  assert.equal(readdirSync(directory).length, 0, "Pack destination must be empty");
  const pack = JSON.parse(execFileSync("npm", ["pack", "--json", "--pack-destination", directory], { cwd: sdk, encoding: "utf8" }));
  assert.equal(pack.length, 1);
  assert.equal(pack[0].filename, `lenslayer-agent-sdk-${version}.tgz`);
  const checks = inspectTarball(join(directory, pack[0].filename), version);
  const sourceDirty = Boolean(execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: sdk, encoding: "utf8" }).trim());
  if (process.env.GITHUB_ACTIONS === "true") assert.equal(sourceDirty, false, "Release checks must not modify tracked source");
  const manifest = { schema: 1, repository, name: packageName, version, sourceSha,
    sourceDirty,
    sourceRef: process.env.GITHUB_REF || "refs/heads/main", runId: process.env.GITHUB_RUN_ID || "local",
    runAttempt: process.env.GITHUB_RUN_ATTEMPT || "local", filename: pack[0].filename, ...checks };
  writeFileSync(join(directory, "pack.json"), `${JSON.stringify(pack, null, 2)}\n`);
  writeFileSync(join(directory, "review.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(directory, "SHA256SUMS"), `${checks.sha256}  ${manifest.filename}\n`);
}
const manifest = JSON.parse(readFileSync(join(directory, "review.json")));
// Use a derived filename, never an unchecked path from downloaded metadata.
const filename = `lenslayer-agent-sdk-${version}.tgz`;
assert.deepEqual(readdirSync(directory).sort(), [filename, "pack.json", "review.json", "SHA256SUMS"].sort());
const path = join(directory, filename);
checkBundle(manifest, JSON.parse(readFileSync(join(directory, "pack.json"))), readFileSync(path), {
  version, sourceSha, sha256: process.env.EXPECTED_SHA256 || manifest.sha256,
  ...(process.env.REVIEW_RUN_ID ? { runId: process.env.REVIEW_RUN_ID } : {}),
  ...(process.env.REVIEW_RUN_ATTEMPT ? { runAttempt: process.env.REVIEW_RUN_ATTEMPT } : {}),
});
assert.equal(readFileSync(join(directory, "SHA256SUMS"), "utf8"), `${manifest.sha256}  ${filename}\n`);
assert.deepEqual(inspectTarball(path, version), { sha256: manifest.sha256, integrity: manifest.integrity, files: manifest.files });
console.log(JSON.stringify({ filename, version, sourceSha, sha256: manifest.sha256, integrity: manifest.integrity }));
