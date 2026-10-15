import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { digest, integrity, packageName } from "./artifact.mjs";
import { checkRegistryInstall, checkRegistryPackage, checkSignatureAudit } from "./registry-check.mjs";

// Read-only registry verification, intended ONLY after an authorized publication.
const review = JSON.parse(readFileSync(join(process.argv[2], "review.json")));
assert.match(review.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
const metadata = await fetch(`https://registry.npmjs.org/@lenslayer%2fagent-sdk/${review.version}`, { redirect: "error", signal: AbortSignal.timeout(30000) });
assert.equal(metadata.status, 200);
const pkg = await metadata.json();
checkRegistryPackage(pkg, review);
const url = new URL(pkg.dist.tarball);
assert.equal(url.origin, "https://registry.npmjs.org");
const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30000) });
assert.equal(response.status, 200);
const bytes = Buffer.from(await response.arrayBuffer());
assert.equal(digest(bytes), review.sha256);
assert.equal(integrity(bytes), review.integrity);
const root = mkdtempSync(join(tmpdir(), "lenslayer-registry-check-"));
try {
  writeFileSync(join(root, "package.json"), JSON.stringify({ private: true, dependencies: { [packageName]: review.version } }));
  // A fresh registry install, never the local tarball: npm skips signature audits
  // for file dependencies. No lifecycle scripts, user config, or shared cache.
  writeFileSync(join(root, "user.npmrc"), "");
  writeFileSync(join(root, "global.npmrc"), "");
  const options = { cwd: root, encoding: "utf8", timeout: 120000, maxBuffer: 8 * 1024 * 1024 };
  const flags = ["--registry=https://registry.npmjs.org/", `--cache=${join(root, "cache")}`,
    `--userconfig=${join(root, "user.npmrc")}`, `--globalconfig=${join(root, "global.npmrc")}`, "--ignore-scripts"];
  execFileSync("npm", ["install", "--no-audit", "--no-fund", ...flags], options);
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json")));
  checkRegistryInstall(lock, review);
  // Nonzero status (invalid/missing signatures, invalid attestations or network
  // failure) throws. Also require positive provenance evidence, not just exit 0.
  const audit = JSON.parse(execFileSync("npm", ["audit", "signatures", "--json", "--include-attestations", ...flags], options));
  checkSignatureAudit(audit, review);
  if (process.argv[3]) {
    const evidence = resolve(process.argv[3]);
    mkdirSync(evidence, { recursive: true });
    writeFileSync(join(evidence, "registry-verification.json"), `${JSON.stringify({
      name: packageName, version: review.version, sha256: review.sha256, integrity: review.integrity,
      sourceSha: review.sourceSha, npm: execFileSync("npm", ["--version", ...flags], options).trim(), lock, audit,
    }, null, 2)}\n`);
  }
} finally { rmSync(root, { recursive: true, force: true }); }
console.log(`Registry bytes match the review; npm verified registry signatures and provenance for ${packageName}@${review.version}, bound to reviewed main source and publish workflow.`);
