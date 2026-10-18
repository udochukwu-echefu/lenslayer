// Public synthetic route only. Never point this harness at a private workspace.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const [target, directory, revision] = process.argv.slice(2);
const url = new URL(target);
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/sample" || url.search) {
  throw new Error("Only a loopback /sample URL without query parameters is permitted.");
}
if (!directory || !revision) throw new Error("Usage: node scripts/profile-public-startup.mjs http://127.0.0.1:3214/sample OUTPUT SOURCE_SHA");
mkdirSync(directory, { recursive: true });
const configuration = {
  lighthouse: "13.5.0", url: url.href, source: revision,
  build: "npm ci && npm run build; npm run start -- --port 3214 (dashboard)",
  formFactor: "mobile", throttlingMethod: "simulate", cache: "fresh Chrome storage per run (Lighthouse default)",
  flags: ["--only-categories=performance", "--chrome-flags=--headless --no-sandbox", "--output=json", "--output=html", "--quiet"],
};
configuration.configSHA256 = createHash("sha256").update(JSON.stringify({ ...configuration, source: undefined })).digest("hex");
const runs = [];
for (let run = 1; run <= 3; run++) {
  const prefix = resolve(directory, `sample-${run}`);
  const result = spawnSync("npx", ["--yes", "lighthouse@13.5.0", url.href, ...configuration.flags, `--output-path=${prefix}`], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || "Lighthouse failed");
  const report = JSON.parse(readFileSync(`${prefix}.report.json`, "utf8"));
  const audit = (key) => report.audits[key].numericValue;
  const resources = report.audits["network-requests"].details.items;
  runs.push({ run, lighthouseVersion: report.lighthouseVersion, environment: report.environment,
    configSettings: report.configSettings, performance: report.categories.performance.score * 100,
    fcp: audit("first-contentful-paint"), lcp: audit("largest-contentful-paint"), tbt: audit("total-blocking-time"), cls: audit("cumulative-layout-shift"),
    jsTransfer: resources.filter((r) => r.resourceType === "Script").reduce((n, r) => n + r.transferSize, 0),
    cssTransfer: resources.filter((r) => r.resourceType === "Stylesheet").reduce((n, r) => n + r.transferSize, 0),
    jsDecoded: resources.filter((r) => r.resourceType === "Script").reduce((n, r) => n + r.resourceSize, 0),
    cssDecoded: resources.filter((r) => r.resourceType === "Stylesheet").reduce((n, r) => n + r.resourceSize, 0),
    authRequests: resources.filter((r) => new URL(r.url).pathname.startsWith("/api/auth/")).map((r) => new URL(r.url).pathname),
  });
}
const summary = Object.fromEntries(["performance", "fcp", "lcp", "tbt", "cls", "jsTransfer", "cssTransfer", "jsDecoded", "cssDecoded"].map((key) => {
  const values = runs.map((run) => run[key]).sort((a, b) => a - b);
  return [key, { median: values[1], min: values[0], max: values[2] }];
}));
writeFileSync(resolve(directory, "summary.json"), JSON.stringify({ configuration, runs, summary }, null, 2));
console.log(JSON.stringify({ configuration, summary }, null, 2));
