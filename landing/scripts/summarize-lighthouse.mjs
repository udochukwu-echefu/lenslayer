import { readFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"

const evidence = process.argv[2]
if (!evidence) throw new Error("Usage: node landing/scripts/summarize-lighthouse.mjs /absolute/evidence/directory")
const metrics = ["first-contentful-paint", "largest-contentful-paint", "speed-index", "total-blocking-time", "cumulative-layout-shift"]
const result = {}
for (const phase of ["baseline", "after"]) {
  const runs = []
  for (const run of [1, 2, 3]) {
    const report = JSON.parse(await readFile(path.join(evidence, phase, `run-${run}.report.json`), "utf8"))
    const requests = report.audits["network-requests"].details.items
    runs.push({ run, fetchTime: report.fetchTime, score: report.categories.performance.score * 100,
      ...Object.fromEntries(metrics.map((metric) => [metric, report.audits[metric].numericValue])),
      transferBytes: requests.reduce((sum, r) => sum + r.transferSize, 0), resourceBytes: requests.reduce((sum, r) => sum + r.resourceSize, 0),
      hero: requests.filter((r) => /dashboard/.test(r.url)).map(({ url, transferSize, resourceSize, priority }) => ({ url, transferSize, resourceSize, priority })),
      fontRequests: requests.filter((r) => /fonts|woff2/.test(r.url)).length, warnings: report.runWarnings,
      lighthouseVersion: report.lighthouseVersion, config: report.configSettings, environment: report.environment })
  }
  const summary = {}
  for (const metric of ["score", ...metrics, "transferBytes", "resourceBytes"]) {
    const values = runs.map((r) => r[metric]).sort((a, b) => a - b)
    summary[metric] = { median: values[1], min: values[0], max: values[2] }
  }
  result[phase] = { summary, runs }
}
console.log(JSON.stringify(result, null, 2))
