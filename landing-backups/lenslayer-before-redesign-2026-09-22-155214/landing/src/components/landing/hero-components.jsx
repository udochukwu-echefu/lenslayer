import { Check, FileText, Link2 } from "lucide-react"

// Adapted from Shadcn Space Hero 02: 2523:10520 / 2683:3326.
export function RoundLink({ href, children, compact = false, light = false }) {
  return <a href={href} className={`round-link${compact ? " round-link-compact" : ""}${light ? " round-link-light" : ""}`}>
    <span>{children}</span><span className="round-link-icon" aria-hidden="true"><img src="/references/shadcn-arrow-up-right.svg" width="16" height="16" alt="" /></span>
  </a>
}

// Sap hero's surrounding widget composition, with LensLayer sample content.
export function HeroEvidence() {
  return <div className="hero-evidence" aria-label="Illustrative contract review">
    <div className="evidence-note evidence-source" data-motion="card-left" data-motion-delay="120">
      <div className="evidence-card-heading"><FileText aria-hidden="true" /><span>FROM THE AGREEMENT</span><span>§ 8.4</span></div>
      <p>“…the applicable Service Credit for <mark>each affected service and reporting period.</mark>”</p>
      <div className="evidence-card-footer"><Link2 aria-hidden="true" /> Every finding starts here.</div>
    </div>
    <div className="evidence-note evidence-decision" data-motion="card-right" data-motion-delay="190">
      <div className="evidence-card-heading"><span className="mini-check"><Check aria-hidden="true" /></span><span>A CLEAR NEXT STEP</span></div>
      <p>Negotiate the credit cap.</p>
      <span className="evidence-detail">Propose an annual limit of 15%.</span>
      <div className="evidence-card-footer"><span className="avatar">MC</span><span>Maya Chen <small>Human decision · sample</small></span><Link2 aria-hidden="true" /></div>
    </div>
  </div>
}
