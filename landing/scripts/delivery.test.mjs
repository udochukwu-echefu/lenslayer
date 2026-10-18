import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../", import.meta.url)
const text = (file) => readFile(new URL(file, root), "utf8")
const json = async (file) => JSON.parse(await text(file))
const hash = (data) => createHash("sha256").update(data).digest("hex")

test("all font subsets retain licensed upstream bytes", async () => {
  const provenance = await json("src/assets/fonts/provenance.json")
  assert.equal(provenance.length, 4)
  for (const font of provenance) {
    const data = await readFile(new URL(`src/assets/fonts/${font.file}`, root))
    assert.equal(data.length, font.bytes)
    assert.equal(hash(data), font.sha256)
  }
  for (const name of ["Figtree", "Instrument-Serif"]) {
    assert.match(await text(`public/fonts/licenses/${name}-OFL.txt`), /SIL OPEN FONT LICENSE Version 1\.1/)
  }
  const css = await text("src/index.css")
  assert.equal((css.match(/font-weight: 400 700;/g) || []).length, 2)
  assert.equal((css.match(/font-family: "Instrument Serif";/g) || []).length, 2)
})

test("responsive AVIF/WebP bytes and dimensions match the source manifest", async () => {
  const manifest = await json("public/hero/manifest.json")
  assert.equal(hash(await readFile(new URL(manifest.source, root))), manifest.sourceSha256)
  assert.equal(manifest.variants.length, 8)
  for (const asset of manifest.variants) {
    const data = await readFile(new URL(`public/hero/${asset.file}`, root))
    assert.equal(data.length, asset.bytes)
    assert.equal(hash(data), asset.sha256)
    assert.ok(asset.width <= 1728)
    assert.ok(Math.abs(asset.height - asset.width * 908 / 1728) <= 0.5)
  }
})

test("HTML discovers the exact eager high-priority hero source before React", async () => {
  const html = await text("index.html")
  const app = await text("src/App.jsx")
  const preloadSet = html.match(/imagesrcset="([^"]+)"/)[1]
  const preloadSizes = html.match(/imagesizes="([^"]+)"/)[1]
  assert.equal(preloadSet, app.match(/type="image\/avif" srcSet="([^"]+)"/)[1])
  assert.equal(preloadSizes, app.match(/type="image\/avif"[^>]*sizes="([^"]+)"/)[1])
  assert.match(app, /loading="eager" fetchPriority="high"/)
  assert.match(app, /width="1728" height="908"/)
  assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic/)
  assert.equal((html.match(/as="font"/g) || []).length, 2)
  assert.doesNotMatch(app, /className="hero-intro" data-motion|className="workspace-preview shell"[^>]*data-motion/)
  assert.match(app, /<div data-motion="stage"><WorkflowCards/)
  assert.match(app, /prefers-reduced-motion/)
})
