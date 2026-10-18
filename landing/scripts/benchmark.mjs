// Audit an already built site on the same loopback preview server in each phase.
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import process from "node:process"
import { brotliCompressSync, gzipSync } from "node:zlib"

const [phase, evidence] = process.argv.slice(2)
if (!phase || !evidence) throw new Error("Usage: node landing/scripts/benchmark.mjs baseline|after /absolute/evidence/directory")
const chrome = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const root = new URL("../", import.meta.url)
const out = path.resolve(evidence, phase)
await mkdir(out, { recursive: true })
const command = (file, args) => execFileSync(file, args, { encoding: "utf8" }).trim()
const sizes = []
async function inventory(directory, prefix = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`
    if (entry.isDirectory()) await inventory(new URL(`${entry.name}/`, directory), `${relative}/`)
    else {
      const data = await readFile(new URL(entry.name, directory))
      sizes.push({ file: relative, bytes: data.length, gzipBytes: gzipSync(data).length, brotliBytes: brotliCompressSync(data).length, sha256: createHash("sha256").update(data).digest("hex") })
    }
  }
}
await inventory(new URL("dist/", root))
const metadata = {
  started: new Date().toISOString(), sourceSha: command("git", ["rev-parse", "HEAD"]), gitStatus: command("git", ["status", "--short"]),
  node: process.version, npm: command("npm", ["--version"]), chrome: command(chrome, ["--version"]), lighthouse: command("npx", ["--yes", "lighthouse@13.5.0", "--version"]),
  os: { platform: os.platform(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0].model, memoryBytes: os.totalmem() },
  buildCommand: "VITE_APP_URL=https://app.lenslayer.online npm run build", serverCommand: "npm run preview -- --host 127.0.0.1 --port 4180 --strictPort",
  cache: "Fresh Chrome process/profile per run; Lighthouse default storage/cache reset; no warm-up; Vite preview unchanged; OS/DNS caches uncontrolled.",
  headers: Object.fromEntries((await fetch("http://127.0.0.1:4180/")).headers), sizes, commands: [],
}
for (let run = 1; run <= 3; run++) {
  const args = ["--yes", "lighthouse@13.5.0", "http://127.0.0.1:4180/", "--only-categories=performance", "--output=json", "--output=html", `--output-path=${out}/run-${run}`, "--chrome-flags=--headless=new --no-first-run --no-default-browser-check", "--quiet"]
  metadata.commands.push({ executable: "npx", args, CHROME_PATH: chrome })
  await writeFile(`${out}/metadata.json`, `${JSON.stringify(metadata, null, 2)}\n`)
  execFileSync("npx", args, { stdio: "inherit", env: { ...process.env, CHROME_PATH: chrome } })
}
metadata.finished = new Date().toISOString()
await writeFile(`${out}/metadata.json`, `${JSON.stringify(metadata, null, 2)}\n`)
