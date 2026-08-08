import { useEffect } from "react"
import {
  Activity,
  ArrowRight,
  CalendarClock,
  Check,
  ChevronRight,
  CircleAlert,
  CloudDownload,
  FileCheck2,
  FileSearch,
  GitCompareArrows,
  Handshake,
  Network,
  ScanSearch,
  ShieldCheck,
  UserCheck,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

const APP_URL = import.meta.env.VITE_APP_URL ?? "http://localhost:3000"
const SAMPLE_URL = `${APP_URL.replace(/\/$/, "")}/sample`

function Brand() {
  return (
    <a className="brand" href="#top" aria-label="Lenslayer home">
      <span className="brand-mark" aria-hidden="true">
        <span>L</span>
        <span>L</span>
      </span>
      <span className="brand-name">Lenslayer</span>
    </a>
  )
}

function ProductFrame() {
  return (
    <div className="product-frame" role="img" aria-label="Example Lenslayer decision workspace with contract, action, and verification work">
      <div className="product-window-bar">
        <div className="product-window-brand">
          <span className="product-window-mark">LL</span>
          <span>Lenslayer workspace</span>
        </div>
        <Badge variant="dark">Human decision layer</Badge>
      </div>
      <div className="product-report-heading">
        <div>
          <span className="product-overline">Today</span>
          <h3>Work that needs a decision.</h3>
          <p>Contracts, verification cases, actions, and deadlines</p>
        </div>
        <span className="attention-pill"><CircleAlert /> 3 need attention</span>
      </div>
      <div className="product-summary" aria-label="Workspace summary">
        <span><strong>6</strong> reviews</span>
        <span><strong>4</strong> actions</span>
        <span><strong>2</strong> verify</span>
        <span><strong>1</strong> overdue</span>
      </div>
      <div className="product-tabs" aria-hidden="true">
        <span className="active">Today</span>
        <span>Contracts</span>
        <span>Verify</span>
        <span>Reports</span>
      </div>
      <div className="work-queue">
        <div className="work-row">
          <span className="work-icon"><FileSearch /></span>
          <div>
            <span className="product-overline">Contract review</span>
            <h4>Supplier Services Agreement</h4>
            <p>Liability cap falls outside the procurement playbook.</p>
          </div>
          <span className="work-status high">Review</span>
        </div>
        <div className="work-row">
          <span className="work-icon"><ShieldCheck /></span>
          <div>
            <span className="product-overline">Verify onboarding</span>
            <h4>Case LLV-2048</h4>
            <p>One evidence conflict requires a reviewer decision.</p>
          </div>
          <span className="work-status medium">Escalate</span>
        </div>
        <div className="work-row">
          <span className="work-icon"><CalendarClock /></span>
          <div>
            <span className="product-overline">Post-signature</span>
            <h4>Renewal notice window</h4>
            <p>Owner assigned. Due in four days.</p>
          </div>
          <span className="work-status">Assigned</span>
        </div>
      </div>
    </div>
  )
}

function App() {
  useEffect(() => {
    const elements = document.querySelectorAll("[data-reveal]")
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-visible", "true")
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12 },
    )
    elements.forEach((element) => observer.observe(element))

    let progressFrame
    const updateScrollProgress = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      const progress = scrollable > 0 ? window.scrollY / scrollable : 0
      document.documentElement.style.setProperty("--scroll-progress", Math.min(Math.max(progress, 0), 1))
      progressFrame = undefined
    }
    const handleScroll = () => {
      if (!progressFrame) progressFrame = window.requestAnimationFrame(updateScrollProgress)
    }
    updateScrollProgress()
    window.addEventListener("scroll", handleScroll, { passive: true })
    window.addEventListener("resize", handleScroll)

    return () => {
      observer.disconnect()
      window.removeEventListener("scroll", handleScroll)
      window.removeEventListener("resize", handleScroll)
      if (progressFrame) window.cancelAnimationFrame(progressFrame)
      document.documentElement.style.removeProperty("--scroll-progress")
    }
  }, [])

  return (
    <div className="site-shell" id="top">
      <div className="scroll-progress" aria-hidden="true" />
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="site-header">
        <div className="nav-shell">
          <Brand />
          <nav className="nav-links" aria-label="Primary navigation">
            <a href="#platform">Platform</a>
            <a href="#evidence">Evidence</a>
            <a href="#governance">Governance</a>
          </nav>
          <Button asChild size="sm">
            <a href={APP_URL}>Open workspace <ArrowRight /></a>
          </Button>
        </div>
      </header>

      <main id="main-content">
        <section className="hero section-shell" aria-labelledby="hero-title">
          <div className="hero-copy" data-reveal>
            <Badge className="hero-badge"><ScanSearch /> Evidence-led document intelligence</Badge>
            <h1 id="hero-title" aria-label="See the evidence. Move the work.">
              <span className="hero-line" aria-hidden="true">See the evidence.</span>
              <span className="hero-line" aria-hidden="true">Move the work.</span>
            </h1>
            <p>
              Lenslayer turns consequential documents into inspectable findings, accountable decisions, and work your team can carry through.
            </p>
            <div className="hero-action-row">
              <Button asChild size="lg">
                <a href={APP_URL}>Start free beta <ArrowRight /></a>
              </Button>
              <a className="hero-sample-link" href={SAMPLE_URL}>Explore a sample review</a>
            </div>
          </div>
          <div className="hero-product" data-reveal>
            <div className="hero-product-note">
              <span>Evidence, decisions, and follow-through stay connected.</span>
              <ChevronRight aria-hidden="true" />
            </div>
            <ProductFrame />
          </div>
        </section>

        <section className="audience" id="platform" aria-labelledby="audience-title">
          <div className="section-shell audience-grid">
            <div className="audience-intro" data-reveal>
              <span className="section-index">One accountable workspace</span>
              <h2 id="audience-title">The document is only the beginning.</h2>
              <p>Lenslayer connects review to the decisions, people, deadlines, and evidence that follow.</p>
            </div>
            <div className="audience-ledger" aria-label="Lenslayer product workspaces">
              {[
                ["01", "Contract Review", "Inspect risks, gaps, obligations, and negotiation priorities"],
                ["02", "Team Decisions", "Assign actions, request approvals, comment, and escalate"],
                ["03", "Contract Operations", "Track renewals, payments, notice windows, and delivery"],
                ["04", "Verify Onboarding", "Reconcile identity evidence and record human decisions"],
                ["05", "Governance", "Audit activity, workload, outcomes, retention, and overrides"],
              ].map(([number, role, outcome]) => (
                <div className="audience-row" key={role} data-reveal>
                  <span className="audience-number">{number}</span>
                  <h3>{role}</h3>
                  <p>{outcome}</p>
                  <ChevronRight aria-hidden="true" />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="workflow section-shell" id="workflow" aria-labelledby="workflow-title">
          <div className="workflow-intro" data-reveal>
            <span className="section-index">01 / Workflow</span>
            <h2 id="workflow-title">From intake to accountable action.</h2>
            <p>A continuous workflow keeps the source, the recommendation, and the person responsible in view.</p>
          </div>
          <div className="workflow-steps">
            {[
              ["01", "Bring work in", "Upload directly or receive documents through email, connected providers, secure links, or API."],
              ["02", "Build the evidence layer", "Extract terms and fields, preserve source locations, surface uncertainty, and reconcile conflicts."],
              ["03", "Make a human decision", "Accept, change, escalate, approve, or reject with rationale and attributable history."],
              ["04", "Carry it through", "Assign actions, close negotiations, monitor obligations, hand off to counsel, and report outcomes."],
            ].map(([number, title, copy]) => (
              <article className="workflow-step" key={number} data-reveal>
                <span>{number}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </div>
                <ArrowRight aria-hidden="true" />
              </article>
            ))}
          </div>
        </section>

        <section className="risk-showcase" id="evidence" aria-labelledby="risk-title">
          <div className="section-shell risk-showcase-grid">
            <div className="risk-copy" data-reveal>
              <span className="section-index section-index-dark">02 / Evidence layer</span>
              <h2 id="risk-title">A recommendation is only useful when you can inspect its source.</h2>
              <p>
                Findings stay attached to the clause or field, its location, the relevant rule, uncertainty, and a concrete next step. The system can recommend. A person decides.
              </p>
              <ul className="risk-proof-list">
                <li><Check /> Verbatim excerpts and extracted values</li>
                <li><Check /> Page, section, field, and source references</li>
                <li><Check /> Risk, confidence, and verification kept separate</li>
                <li><Check /> Playbook position and reviewer action attached</li>
              </ul>
            </div>
            <div className="document-inspector" data-reveal>
              <div className="document-page">
                <div className="document-page-head">
                  <span>Residential Lease Agreement</span>
                  <span>Page 6 / 12</span>
                </div>
                <p className="document-line wide" />
                <p className="document-line" />
                <div className="document-highlight">
                  <span>7. Access to premises</span>
                  <p>The Landlord or their agents may enter the Premises at any time of day or night to inspect the property or perform repairs, without requiring prior notice.</p>
                </div>
                <p className="document-line wide" />
                <p className="document-line short" />
              </div>
              <aside className="inspector-panel" aria-label="Lenslayer finding details">
                <div className="inspector-heading">
                  <Badge>Playbook deviation</Badge>
                  <span>92% extraction confidence</span>
                </div>
                <h3>Entry without notice</h3>
                <p>The clause falls outside the preferred position and needs a reviewer decision before approval.</p>
                <Separator className="inspector-separator" />
                <span className="inspector-label">Preferred position</span>
                <p>Require reasonable written notice except in a genuine emergency.</p>
                <div className="source-chip"><FileSearch /> Source 2 · Section 7</div>
              </aside>
            </div>
          </div>
        </section>

        <section className="capabilities section-shell" aria-labelledby="capabilities-title">
          <div className="capabilities-heading" data-reveal>
            <span className="section-index">03 / Platform layers</span>
            <h2 id="capabilities-title">Built beyond the first review.</h2>
          </div>
          <div className="capability-ledger">
            {[
              ["01", Network, "Secure platform foundation", "Organization workspaces, role-aware access, private storage, background processing, notifications, and audit events."],
              ["02", FileCheck2, "Permanent review workspace", "A searchable contract register, clear processing states, workspace defaults, and durable contract pages."],
              ["03", ScanSearch, "Evidence-linked intelligence", "Risks, protection gaps, grounded Q&A, obligations, payments, deadlines, playbooks, and portable exports."],
              ["04", Handshake, "Collaboration and approvals", "Comments, mentions, assigned actions, conditional approvals, secure external review, and counsel handoff."],
              ["05", CalendarClock, "Operations and Verify", "Renewals, recurring reminders, portfolio evidence, onboarding queues, reconciliation, and attributable decisions."],
              ["06", GitCompareArrows, "Negotiation closeout", "Version history, before-and-after comparison, counterparty responses, unresolved points, and final summaries."],
              ["07", CloudDownload, "Connected intake", "Email, cloud providers, secure request links, API keys, webhooks, provenance, and delivery logs."],
              ["08", Activity, "Reporting and governance", "Throughput, attention queues, Verify outcomes, overrides, reviewer workload, activity history, and CSV reporting."],
            ].map(([number, Icon, title, copy]) => (
              <article className="capability-row" key={title} data-reveal>
                <span className="capability-label">{number}</span>
                <div className="capability-title"><Icon aria-hidden="true" /><h3>{title}</h3></div>
                <p>{copy}</p>
                <ChevronRight aria-hidden="true" />
              </article>
            ))}
          </div>
        </section>

        <section className="trust section-shell" id="governance" aria-labelledby="trust-title">
          <div className="trust-heading" data-reveal>
            <ShieldCheck aria-hidden="true" />
            <div>
              <span className="section-index">04 / Governance</span>
              <h2 id="trust-title">Automation can recommend. It cannot own the decision.</h2>
            </div>
          </div>
          <div className="trust-ledger">
            <div className="trust-lead" data-reveal>
              <p>Consequential document work needs evidence, clear authority, and a record of who decided what.</p>
              <Badge variant="neutral"><UserCheck /> Human-owned by design</Badge>
            </div>
            {[
              ["Attributable decisions", "Actions, approvals, overrides, and verification outcomes retain reviewer rationale and history."],
              ["Private by policy", "Organization scope, role controls, retention choices, source-text controls, and hard deletion remain visible."],
              ["Conflict-gated", "Unresolved evidence conflicts can block approval instead of being hidden behind a score."],
              ["Honest limits", "Risk, extraction confidence, and verification status stay separate. Lenslayer does not provide legal advice or identity assurance."],
            ].map(([title, copy]) => (
              <div className="trust-row" key={title} data-reveal>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="closing-cta" aria-labelledby="cta-title">
          <div className="section-shell closing-cta-inner" data-reveal>
            <div>
              <span>Evidence into action</span>
              <h2 id="cta-title">Bring the document. Own the decision.</h2>
            </div>
            <div className="closing-action">
              <p>Review contracts, reconcile onboarding evidence, coordinate the work, and keep the record.</p>
              <Button asChild variant="inverse" size="lg">
                <a href={APP_URL}>Start free beta <ArrowRight /></a>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="section-shell footer-inner">
          <Brand />
          <p>Evidence-led document intelligence.</p>
          <div className="footer-links">
            <a href={APP_URL}>Live app</a>
            <a href={SAMPLE_URL}>Sample review</a>
            <a href="https://github.com/udochukwu-echefu">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
