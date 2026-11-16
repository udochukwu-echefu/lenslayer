// Fails when the mobile copy of the API types drifts from the dashboard's.
// The dashboard file is the source of truth; copy it over after API changes.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const pairs = [["../../dashboard/src/lib/types.ts", "../src/lib/shared/types.ts"]];
let failed = false;
for (const [source, copy] of pairs) {
  const a = readFileSync(fileURLToPath(new URL(source, import.meta.url)), "utf8");
  const b = readFileSync(fileURLToPath(new URL(copy, import.meta.url)), "utf8");
  if (a !== b) { failed = true; console.error(`Out of sync: mobile/${copy.slice(3)} differs from dashboard/${source.slice(9)}`); }
}
if (failed) process.exit(1);
console.log("Shared API types match the dashboard.");
