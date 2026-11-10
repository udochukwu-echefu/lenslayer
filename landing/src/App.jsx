import { useEffect, useRef, useState } from "react"
import { ArrowDown, ArrowRight, BellRing, CalendarClock, Menu, TriangleAlert, X } from "lucide-react"
import { Brand, LensMark } from "./components/landing/brand"
import WorkflowCards from "./components/landing/workflow-cards"
import AskGrid, { AskHeading } from "./components/landing/ask-section"
import PrivacySection from "./components/landing/privacy-section"
import FaqSection from "./components/landing/faq-section"
import { RoundLink } from "./components/landing/hero-components"
import { resolveAppUrl } from "./app-url.js"

const APP_URL = resolveAppUrl(import.meta.env.DEV ? import.meta.env.VITE_APP_URL : undefined, import.meta.env.PROD)
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
      <div className="shell header-inner"><Brand /><nav className="desktop-nav" aria-label="Primary navigation">{navigation.map((item) => <a href={item.href} key={item.href}>{item.label}</a>)}</nav><div className="header-actions"><RoundLink compact href={SIGN_IN_URL}>Sign in</RoundLink><button type="button" className="menu-button" ref={menuButton} aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}</button></div></div>
      <nav id="mobile-navigation" className="mobile-nav" aria-label="Mobile navigation" hidden={!menuOpen}>{navigation.map((item) => <a href={item.href} key={item.href} onClick={() => setMenuOpen(false)}>{item.label}<ArrowRight aria-hidden="true" /></a>)}<a href={SIGN_IN_URL}>Sign in <ArrowRight aria-hidden="true" /></a></nav>
    </header>
    <main id="main">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-composition shell">
          <div className="hero-intro">
            <h1 id="hero-title">Know what you’ve signed<br /><span>before it renews.</span></h1>
            <div className="hero-copy"><p>LensLayer reads your contracts first. It flags the risky terms, what you’ve promised to do and the dates that matter, and shows you the clause behind each one. Your team makes the calls, and someone gets a reminder before a notice deadline passes.</p><div className="hero-ctas"><RoundLink href={SIGN_IN_URL}>Open your workspace</RoundLink><a className="hero-secondary" href="#workflow">See how it works <ArrowDown aria-hidden="true" /></a></div></div>
          </div>
        </div>
      </section>

      <section className="workflow-section" id="workflow" aria-labelledby="workflow-title">
        <div className="shell">
          <div data-motion="copy-left"><div className="section-heading"><h2 id="workflow-title">From upload<br /><span>to the next decision.</span></h2><p>For the legal, procurement, finance and ops people who are left holding a contract once it’s signed.</p></div></div>
          <div data-motion="stage"><WorkflowCards /></div>
        </div>
      </section>

      <section className="ask-section" id="ask" aria-labelledby="ask-title">
        <div className="shell">
          <AskHeading />
          <div data-motion="stage"><AskGrid signInUrl={SIGN_IN_URL} /></div>
        </div>
      </section>

      <section className="control-section shell" id="renewals" aria-labelledby="renewals-title">
        <div className="control-heading" data-motion="copy-left">
          <h2 id="renewals-title">Stop renewing<br />things by accident.</h2>
          <div><p>Most unwanted renewals happen because nobody saw the notice date coming. LensLayer finds those dates and makes sure a named person hears about them in time.</p></div>
        </div>
        <div className="control-card-grid" data-motion="stage">
          <article className="control-card control-card-retention">
            <div className="control-card-title"><div className="control-card-icon" aria-hidden="true"><CalendarClock /></div><h3>Dates you can check</h3></div>
            <p>Renewal, notice and termination dates come with the clause they’re from. Someone on your team confirms each one before it goes on the calendar.</p>
          </article>
          <article className="control-card">
            <div className="control-card-title"><div className="control-card-icon" aria-hidden="true"><BellRing /></div><h3>A name on every date</h3></div>
            <p>Pick who’s responsible and when they hear about it, anywhere from the day itself to 90 days ahead. Quarterly and yearly dates repeat on their own.</p>
          </article>
          <article className="control-card control-card-sage">
            <div className="control-card-title"><div className="control-card-icon" aria-hidden="true"><TriangleAlert /></div><h3>Missed dates get flagged</h3></div>
            <p>If a date passes and nobody marks it done, the workspace owners and admins are told. The Renewals page keeps every open date in one list.</p>
          </article>
        </div>
      </section>

      <PrivacySection />

      <FaqSection />

      <section className="closing" data-motion="closing" aria-labelledby="closing-title"><div className="shell closing-inner"><LensMark className="closing-mark" /><div><h2 id="closing-title">Start with<br />one contract.</h2><p>Upload an agreement and see what LensLayer finds. You can delete it whenever you like.</p></div><div className="closing-actions"><RoundLink href={SIGN_IN_URL} light>Open your workspace</RoundLink><a className="closing-signin" href="/privacy">Read the privacy policy <ArrowRight aria-hidden="true" /></a></div></div></section>
    </main>
    <footer className="footer shell"><div className="footer-top"><Brand /></div><div className="footer-bottom"><span>© {new Date().getFullYear()} LensLayer</span><nav className="footer-legal" aria-label="Legal"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="mailto:udo@lenslayer.online">Contact</a></nav><a href="#top">Back to top <ArrowRight aria-hidden="true" /></a></div></footer>
  </div>
}
export default App
