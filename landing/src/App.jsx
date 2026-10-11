import { useEffect, useRef, useState } from "react"
import { ArrowDown, ArrowRight, LockKeyhole, Menu, ShieldCheck, UsersRound, X } from "lucide-react"
import { Brand, LensMark } from "./components/landing/brand"
import WorkflowCards from "./components/landing/workflow-cards"
import PortfolioDemo from "./components/landing/portfolio-demo"
import FaqSection from "./components/landing/faq-section"
import { RoundLink } from "./components/landing/hero-components"

const APP_URL = (import.meta.env.VITE_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")
const SAMPLE_URL = `${APP_URL}/runs`
const DOCS_URL = `${APP_URL}/developers`
const SIGN_IN_URL = `${APP_URL}/signin`
const navigation = [{ label: "The workflow", href: "#workflow" }, { label: "Permissions", href: "#control" }, { label: "Developer guide", href: DOCS_URL }]

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
      "hero-copy": [{ opacity: 0, transform: "translate3d(0,24px,0)", clipPath: "inset(0 0 18% 0)" }, { opacity: 1, transform: "none", clipPath: "inset(0 0 0 0)" }],
      stage: [{ opacity: 0, transform: "translate3d(0,34px,0) scale(.985)", clipPath: "inset(7% 0 0 0 round 18px)" }, { opacity: 1, transform: "none", clipPath: "inset(0 0 0 0 round 0)" }],
      "copy-left": [{ opacity: 0, transform: "translate3d(-24px,0,0)" }, { opacity: 1, transform: "none" }],
      "visual-right": [{ opacity: 0, transform: "translate3d(32px,0,0) scale(.985)" }, { opacity: 1, transform: "none" }],
      line: [{ opacity: 0, transform: "translate3d(0,12px,0)", clipPath: "inset(0 100% 0 0)" }, { opacity: 1, transform: "none", clipPath: "inset(0 0 0 0)" }],
      closing: [{ opacity: 0, transform: "translate3d(0,20px,0)" }, { opacity: 1, transform: "none" }],
    }
    const durations = { "hero-copy": 820, stage: 920, "copy-left": 720, "visual-right": 820, line: 760, closing: 760 }
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
      <div className="shell header-inner"><Brand /><nav className="desktop-nav" aria-label="Primary navigation">{navigation.map((item) => <a href={item.href} key={item.href}>{item.label}</a>)}</nav><div className="header-actions"><a className="sign-in" href={SIGN_IN_URL}>Sign in</a><RoundLink compact href={SAMPLE_URL}>Explore sample</RoundLink><button type="button" className="menu-button" ref={menuButton} aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}</button></div></div>
      <nav id="mobile-navigation" className="mobile-nav" aria-label="Mobile navigation" hidden={!menuOpen}>{navigation.map((item) => <a href={item.href} key={item.href} onClick={() => setMenuOpen(false)}>{item.label}<ArrowRight aria-hidden="true" /></a>)}<a href={SIGN_IN_URL}>Sign in <ArrowRight aria-hidden="true" /></a></nav>
    </header>
    <main id="main">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-composition shell">
          <div className="hero-intro" data-motion="hero-copy">
            <h1 id="hero-title">Give agents context.<br /><span>Verify the outcome.</span></h1>
            <div className="hero-copy"><p>Bring your agent. LensLayer scopes its permission to act, records durable execution, and verifies the result. Start with an evidence-linked follow-up task from a retained agreement.</p><div className="hero-ctas"><RoundLink href={DOCS_URL}>Developer guide</RoundLink><a className="hero-secondary" href={SAMPLE_URL}>Explore sample runs <ArrowDown aria-hidden="true" /></a></div></div>
          </div>
        </div>
        <figure className="workspace-preview shell" id="product" data-motion="stage">
          <img className="dashboard-capture" src="/lenslayer-dashboard@2x.jpg" width="2560" height="1600" decoding="async" alt="LensLayer workspace overview with contract statistics and a decision queue" />
          <figcaption className="workspace-caption">The existing document workspace, shown with synthetic records. This capture is not an agent run or a live execution.</figcaption>
        </figure>
      </section>

      <section className="workflow-section" id="workflow" aria-labelledby="workflow-title">
        <div className="shell">
          <div data-motion="copy-left"><div className="section-heading"><h2 id="workflow-title">From retained source<br /><span>to verified task.</span></h2><p>Your client plans. LensLayer enforces scope, pauses for approval, and checks the persisted result. The first workflow creates an internal task; it does not handle the renewal.</p></div></div>
          <div data-motion="stage"><WorkflowCards /></div>
        </div>
      </section>

      <section className="portfolio-section" id="evidence" aria-labelledby="portfolio-title">
        <div className="shell portfolio-grid">
          <div className="portfolio-copy" data-motion="copy-left">
            <h2 id="portfolio-title">A proposal needs<br />more than an answer.</h2>
            <p>Keep source identity, exact task input, and the completion receipt connected. Supply factual dates and an allowed assignee; missing inputs are not permission to guess.</p>
            <a className="text-link" href={SAMPLE_URL}>Explore sample runs <ArrowRight aria-hidden="true" /></a>
          </div>
          <div data-motion="visual-right"><PortfolioDemo sampleUrl={SAMPLE_URL} /></div>
        </div>
      </section>

      <section className="control-section shell" id="control" aria-labelledby="control-title">
        <div className="control-heading" data-motion="copy-left">
          <h2 id="control-title">Permission stays<br />outside the prompt.</h2>
          <p>Retrieved text is data, not policy. A confident model response cannot expand a delegation or approve its own task.</p>
        </div>
        <div className="control-card-grid" data-motion="stage">
          <article className="control-card control-card-retention">
            <div className="control-card-title"><div className="control-card-icon" aria-hidden="true"><LockKeyhole /></div><h3>Choose what to keep</h3></div>
            <p>Agent retrieval needs retained source text. Receipts reference its version and hash; deleting or expiring the source makes the evidence unavailable.</p>
          </article>
          <article className="control-card">
            <div className="control-card-title"><div className="control-card-icon" aria-hidden="true"><UsersRound /></div><h3>Delegate exact scope</h3></div>
            <p>An owner or administrator selects tools, documents, assignees, expiry, and action limits. Keep the one-time bearer credential on your server.</p>
          </article>
          <article className="control-card control-card-sage">
            <div className="control-card-title"><div className="control-card-icon" aria-hidden="true"><ShieldCheck /></div><h3>Approve exact input</h3></div>
            <p>Human approval binds one immutable proposal. The worker rechecks permission and reads the created task back before recording verified completion.</p>
          </article>
        </div>
      </section>

      <aside className="converter-card shell" data-motion="stage" aria-labelledby="converter-title">
        <div className="converter-card-copy"><h3 id="converter-title">Convert financial PDFs</h3><p>Review transaction rows and export CSV, Excel, or JSON. Processing stays in your browser.</p></div>
        <RoundLink compact href={`${APP_URL}/convert`}>Open converter</RoundLink>
      </aside>

      <FaqSection />

      <section className="closing" data-motion="closing" aria-labelledby="closing-title"><div className="shell closing-inner"><LensMark className="closing-mark" /><div><h2 id="closing-title">Build the first<br />verified workflow.</h2><p>Retain a source, scope a credential, and run your server-side client. REST, a local SDK, and stdio MCP use the same ledger.</p></div><div className="closing-actions"><RoundLink href={DOCS_URL} light>Developer guide</RoundLink><a className="closing-signin" href={SIGN_IN_URL}>Open your workspace <ArrowRight aria-hidden="true" /></a></div></div></section>
    </main>
    <footer className="footer shell"><div className="footer-top"><Brand /></div><div className="footer-bottom"><span>© {new Date().getFullYear()} LensLayer</span><a href="#top">Back to top <ArrowRight aria-hidden="true" /></a></div></footer>
  </div>
}
export default App
