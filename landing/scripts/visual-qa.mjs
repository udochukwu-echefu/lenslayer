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
    check(`${name}: hero fetched once, no duplicate preload/fallback`, requests.filter((url) => /(overview-v2-\d+|lenslayer-overview)\.(avif|webp|jpg)/.test(url)).length === 1)
    check(`${name}: hero visible without entrance animation`, await page.evaluate(() => [".hero-intro", ".workspace-preview"].every((selector) => { const e = document.querySelector(selector); return !e.dataset.motion && !e.getAnimations().length && getComputedStyle(e).opacity === "1" })))
    // Avoid Chromium's >16k-pixel full-page tiling artifact at phone DPR 3.
    await page.screenshot({ path: path.join(evidence, `${name}.png`), fullPage: name === "desktop" })
    const snapshot = await page.evaluate(() => ({ text: document.body.innerText, links: [...document.querySelectorAll("a")].map((e) => ({ text: e.textContent, href: e.getAttribute("href") })), boxes: [...document.querySelectorAll(".header,.hero-intro,h1,.hero-copy,.workspace-preview,.dashboard-capture,.workflow-section,.ask-section,.control-section,.privacy-section,.faq-section,.brand")].map((e) => ({ selector: e.className || e.tagName, box: JSON.parse(JSON.stringify(e.getBoundingClientRect())), color: getComputedStyle(e).color, background: getComputedStyle(e).backgroundColor })), fonts: [...document.fonts].map((f) => ({ family: f.family, weight: f.weight, style: f.style, status: f.status })), image: document.querySelector(".dashboard-capture").currentSrc, overflow: document.documentElement.scrollWidth > window.innerWidth }))
    output.captures[name] = snapshot
    check(`${name}: no horizontal overflow`, !snapshot.overflow)
    // The page sells contract review and renewals; frozen dashboard areas stay off it.
    check(`${name}: no agent, SDK, MCP, developer or converter copy`, !/\bagents?\b|\bagentic\b|\bSDK\b|\bMCP\b|developer|converter/i.test(snapshot.text))
    check(`${name}: meta description and title describe contract review`, await page.evaluate(() => /contract review/i.test(document.title) && /renewal/i.test(document.querySelector('meta[name="description"]').content) && !/agent/i.test(document.querySelector('meta[name="description"]').content)))
    for (const [id, heading] of [["workflow", /From upload/], ["ask", /Ask a question/], ["renewals", /Stop renewing/], ["privacy", /What happens/], ["faq", /Questions about/]]) {
      check(`${name}: #${id} section present`, await page.locator(`section#${id} h2`).filter({ hasText: heading }).count() === 1)
    }
    check(`${name}: four workflow steps`, await page.locator(".workflow-card").count() === 4)
    check(`${name}: three renewal cards`, await page.locator("#renewals .control-card").count() === 3)
    check(`${name}: three privacy points with policy links`, await page.locator(".privacy-points li").count() === 3 && await page.locator('#privacy a[href="/privacy"]').count() === 1 && await page.locator('#privacy a[href="/terms"]').count() === 1)
    check(`${name}: grain overlay at 14% opacity`, await page.evaluate(() => getComputedStyle(document.querySelector(".site"), "::after").opacity === "0.14"))
    check(`${name}: responsive high-DPI AVIF selected`, snapshot.image.endsWith(name === "phone" ? "overview-v2-1152.avif" : "overview-v2-1728.avif"))
    if (baseline) {
      const before = baseline[name]
      assert.equal(snapshot.text, before.text, `${name}: exact visible copy`)
      assert.deepEqual(snapshot.links, before.links, `${name}: exact links`)
      output.checks.push(`${name}: exact copy and links match baseline`)
      for (let i = 0; i < before.boxes.length; i++) {
        const a = before.boxes[i], b = snapshot.boxes[i]
        assert.equal(b.color, a.color, `${b.selector} color`)
        assert.equal(b.background, a.background, `${b.selector} background`)
        for (const key of ["x", "y", "width", "height"]) assert.ok(Math.abs(a.box[key] - b.box[key]) < 1, `${name} ${b.selector} ${key}: ${a.box[key]} vs ${b.box[key]}`)
      }
      output.checks.push(`${name}: layout within 1 CSS pixel; colors unchanged`)
    }
    if (name === "phone") {
      for (const section of ["workflow", "ask", "control", "privacy", "faq", "closing"]) {
        await page.locator(`.${section === "closing" ? "closing" : `${section}-section`}`).scrollIntoViewIfNeeded()
        await page.waitForTimeout(1200)
        await page.screenshot({ path: path.join(evidence, `phone-${section}.png`) })
      }
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }))
    }
    check(`${name}: no external font requests`, requests.every((url) => !/fonts\.googleapis|fonts\.gstatic/.test(url)))
    check(`${name}: light only, no theme toggle`, await page.getByRole("button", { name: /Switch to (dark|light) mode/ }).count() === 0 && await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme === "light"))
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
      await page.locator("#mobile-navigation").getByRole("link", { name: "How it works", exact: true }).click()
      check("phone: anchor closes navigation", page.url().endsWith("#workflow") && !(await page.locator("#mobile-navigation").isVisible()))
    } else {
      for (const [label, hash] of [["How it works", "#workflow"], ["Ask", "#ask"], ["Renewals", "#renewals"], ["Privacy", "#privacy"]]) {
        await page.locator(".desktop-nav").getByRole("link", { name: label, exact: true }).click()
        check(`desktop: ${label} anchor`, page.url().endsWith(hash))
      }
    }
    check(`${name}: later stage motion remains`, await page.locator(".workflow-section [data-motion=stage]").count() === 1)
    // Ask: an answer card whose clause chips switch the source card beside it.
    const chips = page.locator(".ask-chip")
    const source = page.locator(".ask-source")
    check(`${name}: Ask answer has four clause chips, first selected`, await chips.count() === 4 && await chips.nth(0).getAttribute("aria-pressed") === "true")
    check(`${name}: source card quotes the selected clause with the key words marked`, await source.locator("blockquote mark").isVisible() && /Loopback/.test(await source.locator("strong").textContent()))
    await chips.nth(1).scrollIntoViewIfNeeded()
    await chips.nth(1).focus()
    await page.keyboard.press("Enter")
    check(`${name}: keyboard switches the source and keeps focus on the chip`, await chips.nth(1).getAttribute("aria-pressed") === "true" && await chips.nth(0).getAttribute("aria-pressed") === "false" && /Workset/.test(await source.locator("strong").textContent()) && await chips.nth(1).evaluate((e) => document.activeElement === e))
    await chips.nth(3).click()
    check(`${name}: unread contract explains why there is no quote`, await source.getAttribute("data-unread") === "true" && await source.locator("blockquote").count() === 0 && /no text to quote/i.test(await source.textContent()))
    check(`${name}: source links to its contract in the demo`, /^https:\/\/app\.lenslayer\.online\/contracts\/demo-marketing$/.test(await source.locator("a").getAttribute("href")))
    await chips.nth(0).click()
    await page.locator(".ask-stage").screenshot({ path: path.join(evidence, `${name}-ask.png`) })
    const faq = page.locator(".faq-item button")
    for (let i = 0; i < await faq.count(); i++) {
      await faq.nth(i).focus()
      if (await faq.nth(i).getAttribute("aria-expanded") !== "true") await page.keyboard.press("Enter")
      const id = await faq.nth(i).getAttribute("aria-controls")
      check(`${name}: FAQ ${i + 1} opens via keyboard`, await faq.nth(i).getAttribute("aria-expanded") === "true" && await page.locator(`[id="${id}"]`).getAttribute("aria-hidden") === "false")
      await page.keyboard.press("Enter")
      check(`${name}: FAQ ${i + 1} closes`, await faq.nth(i).getAttribute("aria-expanded") === "false")
    }
    // Legal pages and the contact address live on this site; everything else opens the app.
    check(`${name}: canonical app links, site legal pages and valid local anchors`, await page.evaluate(() => [...document.querySelectorAll("a")].every((a) => {
      const href = a.getAttribute("href")
      if (href.startsWith("#")) return !!document.getElementById(href.slice(1))
      if (["/privacy", "/terms", "mailto:udo@lenslayer.online"].includes(href)) return true
      return a.origin === "https://app.lenslayer.online"
    })))
    check(`${name}: no links to frozen dashboard areas`, await page.evaluate(() => [...document.querySelectorAll("a")].every((a) => !/^\/(runs|agents|agent-tasks|context|developers|settings\/developers|convert)(\/|$)/.test(a.pathname) || a.origin !== "https://app.lenslayer.online")))
    check(`${name}: no browser/request errors`, failures.length === 0)
    await context.close()
  }
  const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" })
  const page = await reduced.newPage()
  await page.goto("http://127.0.0.1:4180/", { waitUntil: "networkidle" })
  await page.locator(".ask-stage").scrollIntoViewIfNeeded()
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
