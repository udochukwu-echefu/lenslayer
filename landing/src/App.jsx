import { useEffect, useState } from "react"
import {
  ArrowRight,
  Check,
  ChevronRight,
  GitCompareArrows,
  Link2,
  LockKeyhole,
  MessageSquareText,
  ScanSearch,
  ShieldCheck,
} from "lucide-react"

const APP_URL = import.meta.env.VITE_APP_URL ?? "http://localhost:3000"
const SAMPLE_URL = `${APP_URL.replace(/\/$/, "")}/sample`

const layers = {
  evidence: {
    code: "EVD-02",
    title: "Entry without notice",
    detail: "The agreement permits entry at any time without prior notice.",
    status: "Source verified",
    tone: "verified",
  },
  recommendation: {
    code: "REC-07",
    title: "Request revision",
    detail: "Require reasonable written notice, except in a genuine emergency.",
    status: "Automated recommendation",
    tone: "attention",
  },
  decision: {
    code: "DEC-14",
    title: "Changes requested",
    detail: "Reviewer rationale and the requested position are retained with the clause.",
    status: "Human decision recorded",
    tone: "recorded",
  },
}

const capabilities = [
  {
    id: "01",
    icon: ScanSearch,
    title: "Inspect the evidence",
    copy: "Extract terms, ask grounded questions, and keep every material finding linked to its source excerpt.",
    meta: "PDF · DOCX · TXT",
  },
  {
    id: "02",
    icon: GitCompareArrows,
    title: "Prepare the negotiation",
    copy: "Compare revisions, track playbook deviations, build checklists, and produce Word redlines.",
    meta: "Compare · Redline · Playbook",
  },
  {
    id: "03",
    icon: MessageSquareText,
    title: "Record the decision",
    copy: "Assign reviewers, capture rationale, coordinate approvals, and preserve an attributable history.",
    meta: "Comment · Approve · Assign",
  },
  {
    id: "04",
    icon: ShieldCheck,
    title: "Carry work through",
    copy: "Track obligations, renewals, notice periods, payments, reminders, and delivery records after signature.",
    meta: "Obligations · Calendar · Webhooks",
  },
]

function LensMark({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 512 512" aria-hidden="true">
      <defs>
        <mask id="lens-loop-cut">
          <rect width="512" height="512" fill="white" />
          <circle cx="232" cy="256" r="91" fill="black" />
          <path d="M232 204H512V284H232Z" fill="black" />
        </mask>
      </defs>
      <circle cx="232" cy="256" r="208" fill="#e84545" mask="url(#lens-loop-cut)" />
      <path d="M232 278H424L442 350H232Z" fill="#903749" />
    </svg>
  )
}

function Brand() {
  return (
    <a className="brand" href="#top" aria-label="LensLayer home">
      <LensMark />
      <span>LENSLAYER</span>
    </a>
  )
}

function ReviewConsole() {
  const [activeLayer, setActiveLayer] = useState("evidence")
  const layer = layers[activeLayer]

  return (
    <div className="console" aria-label="Illustrative LensLayer review">
      <div className="console-bar">
        <span className="window-controls" aria-hidden="true"><i /><i /><i /></span>
        <span>RESIDENTIAL_LEASE.PDF</span>
        <span className="console-mode">READ ONLY</span>
      </div>
      <div className="console-tabs" role="tablist" aria-label="Review layers">
        {Object.entries(layers).map(([key, item]) => (
          <button
            type="button"
            role="tab"
            aria-selected={key === activeLayer}
            className={key === activeLayer ? "active" : ""}
            key={key}
            onClick={() => setActiveLayer(key)}
          >
            {item.code}
          </button>
        ))}
      </div>
      <div className="console-body">
        <div className="document-pane">
          <div className="document-heading">
            <span>SECTION 07 / ACCESS</span>
            <span>PAGE 6 OF 12</span>
          </div>
          <div className="document-lines" aria-hidden="true">
            <i className="long" /><i /><i className="medium" />
          </div>
          <p className="clause">
            The Landlord or their agents may enter the Premises at any time of day or night to inspect the property or perform repairs, <mark>without requiring prior notice.</mark>
          </p>
          <div className="source-ref"><Link2 aria-hidden="true" /> SOURCE 2 · §7</div>
        </div>
        <aside className="finding-pane" key={activeLayer}>
          <div className={`state ${layer.tone}`}><span />{layer.status}</div>
          <span className="finding-code">{layer.code}</span>
          <h2>{layer.title}</h2>
          <p>{layer.detail}</p>
          <div className="finding-data">
            <div><span>EVIDENCE</span><strong>Attached</strong></div>
            <div><span>CONFIDENCE</span><strong>High</strong></div>
          </div>
          <a href={SAMPLE_URL}>Inspect record <ChevronRight aria-hidden="true" /></a>
        </aside>
      </div>
      <div className="console-footer">
        <span><span className="status-dot" /> ANALYSIS COMPLETE</span>
        <span>ILLUSTRATIVE DATA · 09:44:12</span>
      </div>
    </div>
  )
}

function App() {
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const elements = document.querySelectorAll("[data-reveal]")

    if (reducedMotion || !("IntersectionObserver" in window)) {
      elements.forEach((element) => element.setAttribute("data-visible", "true"))
      return undefined
    }

    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.setAttribute("data-visible", "true")
          observer.unobserve(entry.target)
        }
      }),
      { rootMargin: "0px 0px -8%", threshold: 0.08 },
    )

    elements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [])

  return (
    <div className="site" id="top">
      <a className="skip-link" href="#main">Skip to content</a>

      <header className="header">
        <div className="shell header-inner">
          <Brand />
          <nav aria-label="Primary navigation">
            <a href="#system">System</a>
            <a href="#workflow">Workflow</a>
            <a href="#control">Control</a>
          </nav>
          <a className="button button-small" href={APP_URL}>Open workspace <ArrowRight aria-hidden="true" /></a>
        </div>
      </header>

      <main id="main">
        <section className="hero shell" aria-labelledby="hero-title">
          <div className="hero-copy" data-reveal>
            <div className="eyebrow"><span>CONTRACT INTELLIGENCE</span><span>SYS / 01</span></div>
            <h1 id="hero-title">See the evidence.<br /><span>Own the decision.</span></h1>
            <p>LensLayer turns consequential agreements into source-linked findings, accountable decisions, and operational work your team can carry through.</p>
            <div className="hero-actions">
              <a className="button" href={APP_URL}>Open LensLayer <ArrowRight aria-hidden="true" /></a>
              <a className="button button-quiet" href={SAMPLE_URL}>View sample review</a>
            </div>
            <div className="hero-footnote">
              <span><Check aria-hidden="true" /> First-pass review</span>
              <span><Check aria-hidden="true" /> Human-owned decisions</span>
              <span><Check aria-hidden="true" /> Not legal advice</span>
            </div>
          </div>
          <div className="hero-index" aria-hidden="true" data-reveal>
            <span>01</span>
            <div><i /><i /><i /><i /></div>
            <strong>EVIDENCE<br />DECISION<br />ACTION</strong>
          </div>
        </section>

        <section className="system-section" id="system" aria-labelledby="system-title">
          <div className="shell section-head" data-reveal>
            <div><span className="section-code">SYS / REVIEW LAYERS</span><h2 id="system-title">One continuous line from clause to action.</h2></div>
            <p>Recommendations stay distinct from evidence and human outcomes. Select a layer to inspect the same review from three accountable viewpoints.</p>
          </div>
          <div className="shell" data-reveal><ReviewConsole /></div>
        </section>

        <section className="workflow-section shell" id="workflow" aria-labelledby="workflow-title">
          <div className="workflow-intro" data-reveal>
            <span className="section-code">SYS / OPERATING MODEL</span>
            <h2 id="workflow-title">Review that remains useful after signature.</h2>
          </div>
          <div className="capability-ledger" data-reveal>
            {capabilities.map((item) => {
              const Icon = item.icon
              return (
                <article key={item.id}>
                  <span className="capability-id">{item.id}</span>
                  <Icon aria-hidden="true" />
                  <div><h3>{item.title}</h3><p>{item.copy}</p></div>
                  <span className="capability-meta">{item.meta}</span>
                </article>
              )
            })}
          </div>
        </section>

        <section className="control-section" id="control" aria-labelledby="control-title">
          <div className="shell control-grid">
            <div className="control-copy" data-reveal>
              <span className="section-code">SYS / GOVERNANCE</span>
              <h2 id="control-title">The system recommends.<br />A person decides.</h2>
              <p>Consequential work needs visible limits, clear authority, and an inspectable record of who decided what.</p>
              <a className="text-link" href={APP_URL}>Explore the workspace <ArrowRight aria-hidden="true" /></a>
            </div>
            <div className="decision-log" data-reveal>
              <div className="log-header"><span>DECISION_RECORD.LOG</span><span>LIVE</span></div>
              <div className="log-event current">
                <span>09:42</span><i /><div><strong>Changes requested</strong><p>Reviewer rationale attached to Section 7.</p></div><span>DEC-14</span>
              </div>
              <div className="log-event">
                <span>09:44</span><i /><div><strong>Task assigned</strong><p>Contract owner asked to revise notice language.</p></div><span>TSK-08</span>
              </div>
              <div className="log-event">
                <span>09:44</span><i /><div><strong>Source retained</strong><p>Evidence and playbook position preserved.</p></div><span>EVD-02</span>
              </div>
              <div className="log-footer"><LockKeyhole aria-hidden="true" /> Role-aware · attributable · retained by policy</div>
            </div>
          </div>
        </section>

        <section className="closing shell" aria-labelledby="closing-title" data-reveal>
          <div className="closing-index"><span>READY</span><i /></div>
          <div><span className="section-code">START / PUBLIC PREVIEW</span><h2 id="closing-title">Bring the document.<br />Keep the context.</h2></div>
          <div className="closing-action"><p>Inspect a synthetic, read-only sample before uploading anything.</p><a className="button" href={SAMPLE_URL}>Open sample review <ArrowRight aria-hidden="true" /></a></div>
        </section>
      </main>

      <footer className="footer">
        <div className="shell footer-inner">
          <Brand />
          <p>Evidence-led document intelligence.<br />LensLayer supports first-pass review and does not provide legal advice.</p>
          <div><a href={APP_URL}>Workspace</a><a href={SAMPLE_URL}>Sample</a><a href="https://github.com/udochukwu-echefu">GitHub</a></div>
        </div>
      </footer>
    </div>
  )
}

export default App
