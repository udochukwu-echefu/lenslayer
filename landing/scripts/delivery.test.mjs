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

test("HTML loads local fonts early and keeps motion opt-out", async () => {
  const html = await text("index.html")
  const app = await text("src/App.jsx")
  assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic/)
  assert.equal((html.match(/as="font"/g) || []).length, 2)
  // No product screenshots: the hero is text and calls to action only.
  assert.doesNotMatch(html, /rel="preload" as="image"/)
  assert.doesNotMatch(app, /<picture|<img /)
  assert.doesNotMatch(app, /className="hero-intro" data-motion/)
  assert.match(app, /<div data-motion="stage"><WorkflowCards/)
  assert.match(app, /prefers-reduced-motion/)
})
