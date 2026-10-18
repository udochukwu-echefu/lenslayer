import assert from "node:assert/strict"
import { writeFile, unlink } from "node:fs/promises"
import process from "node:process"
import { renderToStaticMarkup } from "react-dom/server"
import { createElement } from "react"
import { build } from "vite"
import { resolveAppUrl } from "./app-url.js"

const canonical = "https://app.lenslayer.online"
const retired = "https://lenslayer-dashboard.udboy361.workers.dev"
const configuredValues = [undefined, retired, "http://localhost:3000"]

for (const value of [...configuredValues, "", "invalid", "https://other.workers.dev", canonical]) {
  assert.equal(resolveAppUrl(value, true), canonical)
}
assert.equal(resolveAppUrl(), canonical)
assert.equal(resolveAppUrl(undefined, false), canonical)
assert.equal(resolveAppUrl(" http://localhost:3000/ ", false), "http://localhost:3000")
assert.equal(resolveAppUrl("https://preview.example/app/", false), "https://preview.example/app")
for (const value of ["", "invalid", "javascript:alert(1)", "https://user:pass@example.com"]) {
  assert.equal(resolveAppUrl(value, false), canonical)
}

const original = process.env.VITE_APP_URL
const originalDocument = globalThis.document
const originalWindow = globalThis.window
const artifact = new URL("../dist/cta-verification.mjs", import.meta.url)
// Initial render reads theme/motion preferences; effects are not run here.
globalThis.document = { documentElement: { dataset: { theme: "light" } } }
globalThis.window = { matchMedia: () => ({ matches: true }) }
try {
  for (const [index, value] of configuredValues.entries()) {
    if (value === undefined) delete process.env.VITE_APP_URL
    else process.env.VITE_APP_URL = value

    // Do not load local environment files; exercise only the explicit test value.
    const options = { envDir: false, mode: "production", logLevel: "warn" }
    const client = await build(options)
    const scripts = client.output.filter((item) => item.type === "chunk").map((item) => item.code).join("\n")
    assert.ok(scripts.includes(canonical), "Production bundle must contain the canonical app URL")
    assert.ok(!scripts.includes(retired), "Production bundle must not contain the retired host")
    assert.ok(!scripts.includes("http://localhost:3000"), "Production bundle must not contain the local override")

    // Render the production-transformed App to verify actual hrefs, not source text.
    const server = await build({ ...options, build: { ssr: "src/App.jsx", write: false } })
    const entry = server.output.find((item) => item.type === "chunk" && item.isEntry)
    await writeFile(artifact, entry.code)
    const { default: App } = await import(`${artifact.href}?case=${index}`)
    const html = renderToStaticMarkup(createElement(App))
    const hrefs = [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map((match) => match[1])
    for (const route of ["signin", "runs", "", "developers", "convert"]) {
      assert.ok(hrefs.includes(`${canonical}/${route}`), `Missing canonical /${route} href`)
    }
    for (const href of hrefs.filter((href) => !href.startsWith("#"))) {
      assert.equal(new URL(href).origin, canonical, `Unexpected app href: ${href}`)
    }
    console.log(`Production CTA verification passed: ${value ?? "unset VITE_APP_URL"}`)
  }
} finally {
  if (originalDocument === undefined) delete globalThis.document
  else globalThis.document = originalDocument
  if (originalWindow === undefined) delete globalThis.window
  else globalThis.window = originalWindow
  if (original === undefined) delete process.env.VITE_APP_URL
  else process.env.VITE_APP_URL = original
  await unlink(artifact).catch((error) => { if (error.code !== "ENOENT") throw error })
}
