import { useEffect, useRef, useState } from "react"
import { ArrowDown, ArrowRight, Check, FileText, Layers2, Link2, LockKeyhole, Menu, ShieldCheck, UsersRound, X } from "lucide-react"
import { Brand, LensMark } from "./components/landing/brand"
import WorkflowDemo from "./components/landing/workflow-demo"
import PortfolioDemo from "./components/landing/portfolio-demo"
import FaqSection from "./components/landing/faq-section"
import { RoundLink, HeroEvidence } from "./components/landing/hero-components"

const APP_URL = (import.meta.env.VITE_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")
const SAMPLE_URL = `${APP_URL}/sample`
const navigation = [{ label: "The product", href: "#product" }, { label: "How it works", href: "#workflow" }, { label: "Your data", href: "#control" }]

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
      "card-left": [{ opacity: 0, transform: "translate3d(-30px,18px,0) rotate(-11deg) scale(.96)" }, { opacity: 1, transform: "translate3d(0,0,0) rotate(-8deg) scale(1)" }],
      "card-right": [{ opacity: 0, transform: "translate3d(30px,20px,0) rotate(10deg) scale(.96)" }, { opacity: 1, transform: "translate3d(0,0,0) rotate(7deg) scale(1)" }],
      stage: [{ opacity: 0, transform: "translate3d(0,34px,0) scale(.985)", clipPath: "inset(7% 0 0 0 round 18px)" }, { opacity: 1, transform: "none", clipPath: "inset(0 0 0 0 round 0)" }],
      "copy-left": [{ opacity: 0, transform: "translate3d(-24px,0,0)" }, { opacity: 1, transform: "none" }],
      "visual-right": [{ opacity: 0, transform: "translate3d(32px,0,0) scale(.985)" }, { opacity: 1, transform: "none" }],
      line: [{ opacity: 0, transform: "translate3d(0,12px,0)", clipPath: "inset(0 100% 0 0)" }, { opacity: 1, transform: "none", clipPath: "inset(0 0 0 0)" }],
      closing: [{ opacity: 0, transform: "translate3d(0,20px,0)" }, { opacity: 1, transform: "none" }],
    }
    const durations = { "hero-copy": 820, "card-left": 900, "card-right": 900, stage: 920, "copy-left": 720, "visual-right": 820, line: 760, closing: 760 }
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
      <div className="shell header-inner"><Brand /><nav className="desktop-nav" aria-label="Primary navigation">{navigation.map((item) => <a href={item.href} key={item.href}>{item.label}</a>)}</nav><div className="header-actions"><a className="sign-in" href={APP_URL}>Sign in</a><RoundLink compact href={SAMPLE_URL}>Explore sample</RoundLink><button type="button" className="menu-button" ref={menuButton} aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}</button></div></div>
      <nav id="mobile-navigation" className="mobile-nav" aria-label="Mobile navigation" hidden={!menuOpen}>{navigation.map((item) => <a href={item.href} key={item.href} onClick={() => setMenuOpen(false)}>{item.label}<ArrowRight aria-hidden="true" /></a>)}<a href={APP_URL}>Sign in <ArrowRight aria-hidden="true" /></a></nav>
    </header>
    <main id="main">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-composition shell">
          <div className="hero-intro" data-motion="hero-copy">
            <div className="hero-medallion" aria-hidden="true"><LensMark /></div>
            <h1 id="hero-title">The fine print.<br /><span>The bigger picture.</span></h1>
            <div className="hero-copy"><p>Know what’s in your agreement.<br className="desktop-break" /> See what matters, why it matters, and what to do next.</p><div className="hero-ctas"><RoundLink href={SAMPLE_URL}>Explore a sample agreement</RoundLink><a className="hero-secondary" href="#product">Take a closer look <ArrowDown aria-hidden="true" /></a></div><span className="hero-reassurance">No sign-up. No upload. Just a little more clarity.</span></div>
          </div>
          <HeroEvidence />
        </div>
        <div className="hero-stage" id="product" data-motion="stage"><div className="shell"><div className="stage-caption"><span><Layers2 aria-hidden="true" /> One workspace for every next move.</span><a href="#workflow">Follow the workflow <ArrowDown aria-hidden="true" /></a></div><div className="hero-preview"><img className="dashboard-capture" src="/lenslayer-dashboard.png" alt="LensLayer workspace overview with contract statistics and a decision queue" /></div><div className="hero-stage-foot"><p>Live LensLayer workspace. Synthetic demo data.</p><span><FileText aria-hidden="true" /> PDF <span>·</span> DOCX <span>·</span> TXT</span></div></div></div>
        <div className="shell audience-strip" data-motion="line"><p>For the people behind the decision.</p><div><span>Legal</span><span>Procurement</span><span>Finance</span><span>Operations</span></div></div>
      </section>

      <section className="workflow-section shell" id="workflow" aria-labelledby="workflow-title">
        <div data-motion="copy-left"><p className="section-kicker">ONE CONNECTED WORKFLOW</p><div className="section-heading"><h2 id="workflow-title">A contract has a lifecycle.<br /><span>Your review should, too.</span></h2><p>From the first question to the next renewal, keep the evidence and the work in one connected record.</p></div></div>
        <div data-motion="stage"><WorkflowDemo sampleUrl={SAMPLE_URL} /></div>
      </section>

      <section className="portfolio-section" aria-labelledby="portfolio-title"><div className="shell portfolio-grid"><div className="portfolio-copy" data-motion="copy-left"><div className="source-illustration" aria-hidden="true"><div className="source-sheet sheet-back"><FileText aria-hidden="true" /><span /><span /><span /></div><div className="source-sheet sheet-front"><FileText aria-hidden="true" /><span /><span /><span /><span className="sheet-highlight" /></div><div className="source-node"><Link2 aria-hidden="true" /></div></div><p className="section-kicker">ANSWERS YOU CAN TRACE</p><h2 id="portfolio-title">An answer is only as good as its source.</h2><p>Ask across your agreements. Inspect the exact excerpts behind an answer, and see when the evidence is incomplete.</p><ul className="check-list"><li><Check aria-hidden="true" /> Contract and portfolio questions</li><li><Check aria-hidden="true" /> Traceable source excerpts</li><li><Check aria-hidden="true" /> Uncertainty made visible</li></ul><a className="text-link" href={SAMPLE_URL}>See evidence in context <ArrowRight aria-hidden="true" /></a></div><div data-motion="visual-right"><PortfolioDemo sampleUrl={SAMPLE_URL} /></div></div></section>

      <section className="control-section shell" id="control" aria-labelledby="control-title">
        <div className="control-heading" data-motion="copy-left">
          <h2 id="control-title">Your documents.<br />Your decisions. Your control.</h2>
          <p>Useful intelligence should come with clear boundaries. Choose what stays, who can act, and what happens next.</p>
        </div>
        <div className="control-card-grid" data-motion="stage">
          <article className="control-card control-card-retention">
            <div className="control-card-icon" aria-hidden="true"><LockKeyhole /></div>
            <div><h3>Keep only what you need</h3><p>Set retention by review, apply workspace defaults, and remove records when they’re no longer needed.</p></div>
            <ul className="control-card-points"><li>Per-review settings</li><li>Workspace defaults</li><li>Deletion controls</li></ul>
          </article>
          <article className="control-card">
            <div className="control-card-icon" aria-hidden="true"><UsersRound /></div>
            <div><h3>Give access with intention</h3><p>Use workspace roles for reviews, uploads, and approvals, with secure sharing and attributable activity.</p></div>
            <div className="access-visual" aria-hidden="true"><span>RV</span><span>UP</span><span>AP</span><small>Role-based access</small></div>
          </article>
          <article className="control-card control-card-sage">
            <div className="control-card-icon" aria-hidden="true"><ShieldCheck /></div>
            <div><h3>Keep people in charge</h3><p>Separate automated findings from human decisions, with a clear owner and rationale for every next step.</p></div>
            <div className="decision-visual" aria-hidden="true"><span>Finding</span><i /><span>Owner</span><i /><span>Decision</span></div>
          </article>
        </div>
      </section>

      <aside className="converter-card shell" data-motion="stage" aria-labelledby="converter-title">
        <div className="converter-art" aria-hidden="true"><span>PDF</span><ArrowRight /><span className="data-file"><i /><i /><i /><i /><i /><i /></span></div>
        <div className="converter-card-copy"><h3 id="converter-title">Working with financial PDFs, too?</h3><p>Review transaction rows and export CSV, Excel, or JSON. Processing stays in your browser.</p></div>
        <RoundLink compact href={`${APP_URL}/convert`}>Open document converter</RoundLink>
      </aside>

      <FaqSection />

      <section className="closing" data-motion="closing" aria-labelledby="closing-title"><div className="shell closing-inner"><LensMark className="closing-mark" /><div><h2 id="closing-title">Your next agreement.<br />A clearer starting point.</h2><p>Start with our sample. See what’s in the fine print.</p></div><div className="closing-actions"><RoundLink href={SAMPLE_URL} light>Explore sample</RoundLink><a className="closing-signin" href={APP_URL}>Or open your workspace <ArrowRight aria-hidden="true" /></a></div></div></section>
    </main>
    <footer className="footer shell"><div className="footer-top"><Brand /></div><div className="footer-bottom"><span>© {new Date().getFullYear()} LensLayer</span><a href="#top">Back to top <ArrowRight aria-hidden="true" /></a></div></footer>
  </div>
}
export default App
