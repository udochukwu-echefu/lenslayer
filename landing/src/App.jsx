import { useEffect, useRef, useState } from "react"
import { ArrowRight, BellRing, CalendarClock, Menu, TriangleAlert, X } from "lucide-react"
import { Brand, LensMark } from "./components/landing/brand"
import WorkflowCards from "./components/landing/workflow-cards"
import PortfolioDemo from "./components/landing/portfolio-demo"
import PrivacySection from "./components/landing/privacy-section"
import FaqSection from "./components/landing/faq-section"
import { RoundLink } from "./components/landing/hero-components"
import { resolveAppUrl } from "./app-url.js"

const APP_URL = resolveAppUrl(import.meta.env.DEV ? import.meta.env.VITE_APP_URL : undefined, import.meta.env.PROD)
// Anonymous visitors to the app root enter the read-only demo workspace.
const DEMO_URL = `${APP_URL}/`
const ASK_URL = `${APP_URL}/portfolio`
const RENEWALS_URL = `${APP_URL}/calendar`
const SIGN_IN_URL = `${APP_URL}/signin`
const navigation = [{ label: "How it works", href: "#workflow" }, { label: "Ask", href: "#ask" }, { label: "Renewals", href: "#renewals" }, { label: "Privacy", href: "#privacy" }]

function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButton = useRef(null)
  useEffect(() => {
    function onEscape(event) {
      if (event.key === "Escape" && menuOpen) { setMenuOpen(false); menuButton.current?.focus() }
    }
    document.addEventListener("keydown", onEscape)
    return () => document.removeEventListener("keydown", onEscape)
  }, [menuOpen])
  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduceMotion || !window.IntersectionObserver) return

    const ease = "cubic-bezier(.16,1,.3,1)"
    const recipes = {
      stage: [{ opacity: 0, transform: "translate3d(0,34px,0) scale(.985)", clipPath: "inset(7% 0 0 0 round 18px)" }, { opacity: 1, transform: "none", clipPath: "inset(0 0 0 0 round 0)" }],
      "copy-left": [{ opacity: 0, transform: "translate3d(-24px,0,0)" }, { opacity: 1, transform: "none" }],
      "visual-right": [{ opacity: 0, transform: "translate3d(32px,0,0) scale(.985)" }, { opacity: 1, transform: "none" }],
      line: [{ opacity: 0, transform: "translate3d(0,12px,0)", clipPath: "inset(0 100% 0 0)" }, { opacity: 1, transform: "none", clipPath: "inset(0 0 0 0)" }],
      closing: [{ opacity: 0, transform: "translate3d(0,20px,0)" }, { opacity: 1, transform: "none" }],
    }
    const durations = { stage: 920, "copy-left": 720, "visual-right": 820, line: 760, closing: 760 }
    const observer = new IntersectionObserver((entries) => entries.forEach(({ isIntersecting, target }) => {
      if (!isIntersecting) return
      const motion = target.dataset.motion
      const delay = Number(target.dataset.motionDelay || 0)
      target.animate(recipes[motion] || recipes.closing, { duration: durations[motion] || 720, delay, easing: ease, fill: "both" })
      observer.unobserve(target)
    }), { threshold: 0.14, rootMargin: "0px 0px -7%" })
    document.querySelectorAll("[data-motion]").forEach((element) => observer.observe(element))
    return () => {
      observer.disconnect()
    }
  }, [])

  return <div className="site" id="top">
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="header">
      <div className="shell header-inner"><Brand /><nav className="desktop-nav" aria-label="Primary navigation">{navigation.map((item) => <a href={item.href} key={item.href}>{item.label}</a>)}</nav><div className="header-actions"><a className="header-secondary" href={DEMO_URL}>Explore demo</a><RoundLink compact href={SIGN_IN_URL}>Sign in</RoundLink><button type="button" className="menu-button" ref={menuButton} aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}</button></div></div>
      <nav id="mobile-navigation" className="mobile-nav" aria-label="Mobile navigation" hidden={!menuOpen}>{navigation.map((item) => <a href={item.href} key={item.href} onClick={() => setMenuOpen(false)}>{item.label}<ArrowRight aria-hidden="true" /></a>)}<a href={DEMO_URL}>Explore demo <ArrowRight aria-hidden="true" /></a><a href={SIGN_IN_URL}>Sign in <ArrowRight aria-hidden="true" /></a></nav>
    </header>
    <main id="main">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-composition shell">
          <div className="hero-intro">
            <h1 id="hero-title">Know what you’ve signed<br /><span>before it renews.</span></h1>
            <div className="hero-copy"><p>Upload an agreement and get a first-pass review of its risks, obligations and key dates, each linked to the clause it came from. Your team records the decisions, and every notice window gets an owner and a reminder.</p><div className="hero-ctas"><RoundLink href={SIGN_IN_URL}>Open your workspace</RoundLink><a className="hero-secondary" href={DEMO_URL}>Explore the demo workspace <ArrowRight aria-hidden="true" /></a></div></div>
          </div>
        </div>
        <figure className="workspace-preview shell" id="product">
          <picture>
            <source type="image/avif" srcSet="/hero/overview-v2-480.avif 480w, /hero/overview-v2-768.avif 768w, /hero/overview-v2-1152.avif 1152w, /hero/overview-v2-1728.avif 1728w" sizes="(max-width: 560px) calc(100vw - 40px), min(91vw, 1240px)" />
            <source type="image/webp" srcSet="/hero/overview-v2-480.webp 480w, /hero/overview-v2-768.webp 768w, /hero/overview-v2-1152.webp 1152w, /hero/overview-v2-1728.webp 1728w" sizes="(max-width: 560px) calc(100vw - 40px), min(91vw, 1240px)" />
            <img className="dashboard-capture" src="/lenslayer-overview.jpg" width="1728" height="908" loading="eager" fetchPriority="high" decoding="async" alt="Overview in the Relay Software demo workspace: six agreements, two ready for a decision, four open actions and five upcoming dates, above a decision queue of agreements that need a person's next step" />
          </picture>
          <figcaption className="workspace-caption">Overview in Relay Software’s demo workspace. The companies and agreements are fictional, and the demo is read-only.</figcaption>
        </figure>
      </section>

      <section className="workflow-section" id="workflow" aria-labelledby="workflow-title">
        <div className="shell">
          <div data-motion="copy-left"><div className="section-heading"><h2 id="workflow-title">From upload<br /><span>to the next decision.</span></h2><p>LensLayer does the first read. Your team makes the calls. For legal, procurement, finance and operations teams who share contracts and the work that comes after signing.</p></div></div>
          <div data-motion="stage"><WorkflowCards /></div>
        </div>
      </section>

      <section className="portfolio-section" id="ask" aria-labelledby="portfolio-title">
        <div className="shell portfolio-grid">
          <div className="portfolio-copy" data-motion="copy-left">
            <h2 id="portfolio-title">Answers that show<br />their sources.</h2>
            <p>Ask about one agreement or all of them. Each answer quotes the sections it relies on, and says so when the documents don’t settle the question.</p>
            <a className="text-link" href={ASK_URL}>Ask in the demo workspace <ArrowRight aria-hidden="true" /></a>
          </div>
          <div data-motion="visual-right"><PortfolioDemo appUrl={APP_URL} /></div>
        </div>
      </section>

      <section className="control-section shell" id="renewals" aria-labelledby="renewals-title">
        <div className="control-heading" data-motion="copy-left">
          <h2 id="renewals-title">Nothing renews<br />without a decision.</h2>
          <div><p>An auto-renewal clause is easy to miss in a signed PDF. LensLayer pulls out the dates and keeps them in front of the people responsible.</p><a className="text-link" href={RENEWALS_URL}>See Renewals in the demo <ArrowRight aria-hidden="true" /></a></div>
        </div>
        <div className="control-card-grid" data-motion="stage">
          <article className="control-card control-card-retention">
            <div className="control-card-title"><div className="control-card-icon" aria-hidden="true"><CalendarClock /></div><h3>Dates with their source</h3></div>
            <p>The review lists renewal, notice and termination dates with the clause each one came from. Someone on your team checks a date before it goes on the calendar.</p>
          </article>
          <article className="control-card">
            <div className="control-card-title"><div className="control-card-icon" aria-hidden="true"><BellRing /></div><h3>An owner and a reminder</h3></div>
            <p>Give each date an owner and choose when the reminder goes out, from the day itself to 90 days before. Quarterly and yearly dates can repeat.</p>
          </article>
          <article className="control-card control-card-sage">
            <div className="control-card-title"><div className="control-card-icon" aria-hidden="true"><TriangleAlert /></div><h3>Overdue dates escalate</h3></div>
            <p>If a date passes without being marked complete, the workspace owners and admins hear about it. Renewals lists every open date and task across your agreements.</p>
          </article>
        </div>
      </section>

      <PrivacySection />

      <FaqSection />

      <section className="closing" data-motion="closing" aria-labelledby="closing-title"><div className="shell closing-inner"><LensMark className="closing-mark" /><div><h2 id="closing-title">See it with<br />sample agreements.</h2><p>Open Relay Software’s demo workspace without an account, or sign in to review your own agreements.</p></div><div className="closing-actions"><RoundLink href={DEMO_URL} light>Explore the demo</RoundLink><a className="closing-signin" href={SIGN_IN_URL}>Open your workspace <ArrowRight aria-hidden="true" /></a></div></div></section>
    </main>
    <footer className="footer shell"><div className="footer-top"><Brand /></div><div className="footer-bottom"><span>© {new Date().getFullYear()} LensLayer</span><nav className="footer-legal" aria-label="Legal"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="mailto:udo@lenslayer.online">Contact</a></nav><a href="#top">Back to top <ArrowRight aria-hidden="true" /></a></div></footer>
  </div>
}
export default App
