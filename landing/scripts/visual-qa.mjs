/* global document, window, getComputedStyle */
// Isolated tooling, not an application dependency. See docs/performance-batch3-landing.md.
import assert from "node:assert/strict"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { pathToFileURL } from "node:url"

if (!process.env.PLAYWRIGHT_MODULE || !process.env.EVIDENCE_DIR) throw new Error("Set PLAYWRIGHT_MODULE and EVIDENCE_DIR; BASELINE_VISUAL is optional.")
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE))
const evidence = path.resolve(process.env.EVIDENCE_DIR)
await mkdir(evidence, { recursive: true })
const baseline = process.env.BASELINE_VISUAL ? JSON.parse(await readFile(process.env.BASELINE_VISUAL, "utf8")) : null
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true })
const output = { checks: [], captures: {} }
const check = (label, value) => { assert.ok(value, label); output.checks.push(label) }
try {
  for (const [name, width, height, deviceScaleFactor] of [["phone", 390, 844, 3], ["desktop", 1440, 1000, 2]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor })
    const page = await context.newPage()
    const failures = []
    const requests = []
    page.on("pageerror", (error) => failures.push(error.message))
    page.on("requestfailed", (request) => failures.push(`${request.url()}: ${request.failure()?.errorText}`))
    page.on("request", (request) => requests.push(request.url()))
    await page.goto("http://127.0.0.1:4180/", { waitUntil: "networkidle" })
    await page.evaluate(() => document.fonts.ready)
    // Full-page screenshots temporarily alter Chromium device metrics and may
    // select a smaller candidate; verify delivery before taking screenshots.
    check(`${name}: hero fetched once, no duplicate preload/fallback`, requests.filter((url) => /dashboard.*\.(avif|webp|jpg)/.test(url)).length === 1)
    check(`${name}: hero visible without entrance animation`, await page.evaluate(() => [".hero-intro", ".workspace-preview"].every((selector) => { const e = document.querySelector(selector); return !e.dataset.motion && !e.getAnimations().length && getComputedStyle(e).opacity === "1" })))
    for (const theme of ["light", "dark"]) {
      if (theme === "dark") {
        await page.getByRole("button", { name: "Switch to dark mode", exact: true }).click()
        await page.waitForTimeout(1200)
      }
      // Avoid Chromium's >16k-pixel full-page tiling artifact at phone DPR 3.
      await page.screenshot({ path: path.join(evidence, `${name}-${theme}.png`), fullPage: name === "desktop" })
      const snapshot = await page.evaluate(() => ({ text: document.body.innerText, links: [...document.querySelectorAll("a")].map((e) => ({ text: e.textContent, href: e.getAttribute("href") })), boxes: [...document.querySelectorAll(".header,.hero-intro,h1,.hero-copy,.workspace-preview,.dashboard-capture,.workflow-section,.portfolio-section,.control-section,.faq-section,.brand")].map((e) => ({ selector: e.className || e.tagName, box: JSON.parse(JSON.stringify(e.getBoundingClientRect())), color: getComputedStyle(e).color, background: getComputedStyle(e).backgroundColor })), fonts: [...document.fonts].map((f) => ({ family: f.family, weight: f.weight, style: f.style, status: f.status })), image: document.querySelector(".dashboard-capture").currentSrc, overflow: document.documentElement.scrollWidth > window.innerWidth }))
      output.captures[`${name}-${theme}`] = snapshot
      check(`${name}/${theme}: no horizontal overflow`, !snapshot.overflow)
      check(`${name}/${theme}: responsive high-DPI AVIF selected`, snapshot.image.endsWith(name === "phone" ? "dashboard-v1-1152.avif" : "dashboard-v1-1728.avif"))
      if (baseline) {
        const before = baseline[`${name}-${theme}`]
        assert.equal(snapshot.text, before.text, `${name}/${theme}: exact visible copy`)
        assert.deepEqual(snapshot.links, before.links, `${name}/${theme}: exact links`)
        output.checks.push(`${name}/${theme}: exact copy and links match baseline`)
        for (let i = 0; i < before.boxes.length; i++) {
          const a = before.boxes[i], b = snapshot.boxes[i]
          assert.equal(b.color, a.color, `${b.selector} color`)
          assert.equal(b.background, a.background, `${b.selector} background`)
          for (const key of ["x", "y", "width", "height"]) assert.ok(Math.abs(a.box[key] - b.box[key]) < 1, `${name}/${theme} ${b.selector} ${key}: ${a.box[key]} vs ${b.box[key]}`)
        }
        output.checks.push(`${name}/${theme}: layout within 1 CSS pixel; colors unchanged`)
      }
      if (name === "phone") {
        for (const section of ["workflow", "portfolio", "control", "faq", "closing"]) {
          await page.locator(`.${section === "closing" ? "closing" : `${section}-section`}`).scrollIntoViewIfNeeded()
          await page.waitForTimeout(1200)
          await page.screenshot({ path: path.join(evidence, `phone-${theme}-${section}.png`) })
        }
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }))
      }
    }
    check(`${name}: no external font requests`, requests.every((url) => !/fonts\.googleapis|fonts\.gstatic/.test(url)))
    await page.reload({ waitUntil: "networkidle" })
    check(`${name}: dark theme persists after reload`, await page.locator("html").getAttribute("data-theme") === "dark")
    const themeButton = page.getByRole("button", { name: "Switch to light mode", exact: true })
    await themeButton.focus()
    await page.keyboard.press("Enter")
    check(`${name}: keyboard theme toggle is immediate`, await page.locator("html").getAttribute("data-theme") === "light")
    check(`${name}: theme transition cleanup`, !(await page.locator("html").getAttribute("data-theme-reveal")))
    await page.keyboard.press("Tab")
    check(`${name}: focus outline visible`, await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== "none"))
    if (name === "phone") {
      const menu = page.getByRole("button", { name: "Open navigation", exact: true })
      await menu.click()
      check("phone: navigation expands", await page.locator("#mobile-navigation").isVisible())
      await page.screenshot({ path: path.join(evidence, "phone-navigation.png") })
      await page.keyboard.press("Escape")
      check("phone: Escape closes menu and restores focus", await menu.evaluate((e) => document.activeElement === e) && !(await page.locator("#mobile-navigation").isVisible()))
      await menu.click()
      await page.locator("#mobile-navigation").getByRole("link", { name: "The workflow", exact: true }).click()
      check("phone: anchor closes navigation", page.url().endsWith("#workflow") && !(await page.locator("#mobile-navigation").isVisible()))
    } else {
      await page.locator(".desktop-nav").getByRole("link", { name: "The workflow", exact: true }).click()
      check("desktop: workflow anchor", page.url().endsWith("#workflow"))
    }
    check(`${name}: later stage motion remains`, await page.locator(".workflow-section [data-motion=stage]").count() === 1)
    const controls = page.getByRole("group", { name: "Walkthrough cards", exact: true })
    const evidenceButton = controls.getByRole("button").nth(0)
    await evidenceButton.scrollIntoViewIfNeeded()
    await evidenceButton.click()
    await page.keyboard.press("ArrowRight")
    check(`${name}: carousel arrow preserves persistent-control focus`, await evidenceButton.evaluate((e) => document.activeElement === e))
    check(`${name}: carousel arrow changes active slide`, await controls.getByRole("button").nth(1).getAttribute("aria-pressed") === "true")
    await page.keyboard.press("ArrowLeft")
    check(`${name}: carousel reverses`, await evidenceButton.getAttribute("aria-pressed") === "true")
    const source = page.locator('.portfolio-carousel-card[data-position="front"] .answer-source')
    await source.focus()
    await page.keyboard.press("ArrowRight")
    check(`${name}: source-link arrows do not change slide or lose focus`, await source.evaluate((e) => document.activeElement === e) && await evidenceButton.getAttribute("aria-pressed") === "true")
    check(`${name}: background slides remain inert`, await page.locator('.portfolio-carousel-card[aria-hidden="true"][inert]').count() === 2)
    await page.waitForTimeout(8300)
    check(`${name}: focused/manual carousel stays paused`, await evidenceButton.getAttribute("aria-pressed") === "true")
    await page.screenshot({ path: path.join(evidence, `${name}-carousel-focus.png`) })
    const faq = page.locator(".faq-item button")
    for (let i = 0; i < await faq.count(); i++) {
      await faq.nth(i).focus()
      if (await faq.nth(i).getAttribute("aria-expanded") !== "true") await page.keyboard.press("Enter")
      const id = await faq.nth(i).getAttribute("aria-controls")
      check(`${name}: FAQ ${i + 1} opens via keyboard`, await faq.nth(i).getAttribute("aria-expanded") === "true" && await page.locator(`[id="${id}"]`).getAttribute("aria-hidden") === "false")
      await page.keyboard.press("Enter")
      check(`${name}: FAQ ${i + 1} closes`, await faq.nth(i).getAttribute("aria-expanded") === "false")
    }
    check(`${name}: canonical app links and valid local anchors`, await page.evaluate(() => [...document.querySelectorAll("a")].every((a) => a.getAttribute("href").startsWith("#") ? !!document.getElementById(a.hash.slice(1)) : a.origin === "https://app.lenslayer.online")))
    check(`${name}: no browser/request errors`, failures.length === 0)
    await context.close()
  }
  const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" })
  const page = await reduced.newPage()
  await page.goto("http://127.0.0.1:4180/", { waitUntil: "networkidle" })
  await page.locator(".portfolio-carousel").scrollIntoViewIfNeeded()
  check("reduced motion: no carousel progress animation", await page.locator(".portfolio-slide-progress").count() === 0)
  check("reduced motion: no reveal animations", await page.evaluate(() => document.getAnimations().length === 0))
  await reduced.close()
  for (const [label, disabled, extension] of [["WebP", ["avif"], "webp"], ["JPEG", ["avif", "webp"], "jpg"]]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    await cdp.send("Emulation.setDisabledImageTypes", { imageTypes: disabled })
    await page.goto("http://127.0.0.1:4180/", { waitUntil: "networkidle" })
    check(`${label}: picture fallback decodes`, await page.locator(".dashboard-capture").evaluate((e, ext) => e.currentSrc.endsWith(ext) && e.complete && e.naturalWidth > 0, extension))
    await context.close()
  }
  output.passed = true
} finally {
  await writeFile(path.join(evidence, "visual.json"), `${JSON.stringify(output, null, 2)}\n`)
  await browser.close()
}
console.log(`${output.checks.length} visual/interaction checks passed`)
