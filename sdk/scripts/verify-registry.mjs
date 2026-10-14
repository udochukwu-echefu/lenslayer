import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { digest, integrity, packageName } from "./artifact.mjs";

// Read-only registry verification, intended ONLY after an authorized publication.
const review = JSON.parse(readFileSync(join(process.argv[2], "review.json")));
const metadata = await fetch(`https://registry.npmjs.org/@lenslayer%2fagent-sdk/${review.version}`, { redirect: "error" });
assert.equal(metadata.status, 200);
const pkg = await metadata.json();
assert.equal(pkg.name, packageName);
assert.equal(pkg.version, review.version);
assert.equal(pkg.dist.integrity, review.integrity);
assert.ok(pkg.dist.attestations?.url, "Registry must advertise provenance attestations");
const url = new URL(pkg.dist.tarball);
assert.equal(url.origin, "https://registry.npmjs.org");
const response = await fetch(url, { redirect: "error" });
assert.equal(response.status, 200);
const bytes = Buffer.from(await response.arrayBuffer());
assert.equal(digest(bytes), review.sha256);
assert.equal(integrity(bytes), review.integrity);
console.log(`Registry bytes match reviewed SHA-256 and npm integrity for ${packageName}@${review.version}; attestations advertised (not independently cryptographically verified here).`);
