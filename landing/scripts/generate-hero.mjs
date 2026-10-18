// Tooling only: SHARP_MODULE must point to a separately installed sharp entrypoint.
// SHARP_MODULE=/absolute/path/to/sharp/lib/index.js node landing/scripts/generate-hero.mjs
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { fileURLToPath, pathToFileURL } from "node:url"
import process from "node:process"

if (!process.env.SHARP_MODULE) throw new Error("Set SHARP_MODULE to an isolated sharp 0.34.5 installation (not an app dependency).")
const { default: sharp } = await import(pathToFileURL(process.env.SHARP_MODULE))
const root = new URL("../", import.meta.url)
const source = new URL("public/lenslayer-dashboard@2x.jpg", root)
const directory = new URL("public/hero/", root)
await mkdir(directory, { recursive: true })
const sha256 = (data) => createHash("sha256").update(data).digest("hex")
const manifest = { source: "public/lenslayer-dashboard@2x.jpg", sourceSha256: sha256(await readFile(source)), sharp: sharp.versions, variants: [] }
for (const width of [480, 768, 1152, 1728]) {
  for (const format of ["avif", "webp"]) {
    const image = sharp(fileURLToPath(source)).resize({ width, withoutEnlargement: true })
    // High quality + 4:4:4 AVIF keep fine screenshot labels intact; no upscaling.
    const data = await (format === "avif" ? image.avif({ quality: 75, effort: 9, chromaSubsampling: "4:4:4" }) : image.webp({ quality: 90, effort: 6 })).toBuffer()
    const file = `dashboard-v1-${width}.${format}`
    await writeFile(new URL(file, directory), data)
    const metadata = await sharp(data).metadata()
    manifest.variants.push({ file, width: metadata.width, height: metadata.height, bytes: data.length, sha256: sha256(data) })
  }
}
await writeFile(new URL("manifest.json", directory), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify(manifest.variants, null, 2))
