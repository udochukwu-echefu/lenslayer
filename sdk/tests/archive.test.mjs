import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectTarball, packageFiles } from "../scripts/artifact.mjs";

test("actual archive inspection rejects extra/missing files, symlinks, changed license and credential patterns", () => {
  const sdk = fileURLToPath(new URL("..", import.meta.url));
  const version = JSON.parse(readFileSync(join(sdk, "package.json"))).version;
  const root = mkdtempSync(join(tmpdir(), "lenslayer-archive-test-"));
  try {
    for (const file of packageFiles) {
      mkdirSync(dirname(join(root, "package", file)), { recursive: true });
      cpSync(join(sdk, file), join(root, "package", file));
    }
    const archive = join(root, "test.tgz");
    const pack = (files = packageFiles) => execFileSync("tar", ["-czf", archive, "-C", root, ...files.map((file) => `package/${file}`)]);
    pack(); inspectTarball(archive, version);
    writeFileSync(join(root, "package/unreviewed.js"), "export default 1;");
    pack([...packageFiles, "unreviewed.js"]); assert.throws(() => inspectTarball(archive, version));
    pack(packageFiles.filter((file) => file !== "LICENSE")); assert.throws(() => inspectTarball(archive, version));
    writeFileSync(join(root, "package/LICENSE"), "All rights reserved");
    pack(); assert.throws(() => inspectTarball(archive, version));
    cpSync(join(sdk, "LICENSE"), join(root, "package/LICENSE"));
    writeFileSync(join(root, "package/README.md"), `Synthetic credential: ${["ll", "agent", "synthetic_archive_only"].join("_")}`);
    pack(); assert.throws(() => inspectTarball(archive, version));
    rmSync(join(root, "package/README.md"));
    symlinkSync("LICENSE", join(root, "package/README.md"));
    pack(); assert.throws(() => inspectTarball(archive, version));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
