import { useState } from "react"
import { usePanelMotion } from "../../hooks/use-panel-motion"
import { ArrowRight, Check, ChevronRight, CircleAlert, FileText, Link2, ListChecks, MessageSquareText, PanelLeft, ShieldCheck } from "lucide-react"
import { LensMark } from "./brand"

const layers = [
  { label: "Finding", title: "Service credits have no annual limit", body: "Clause 8.4 lets credits build up for each service and month. It does not state a total limit.", status: "Needs review", icon: CircleAlert, detail: "Clause 8.4 · Page 12", note: "Check the full agreement before relying on this finding." },
  { label: "Next move", title: "Ask for a limit of 15% of annual fees", body: "Propose a yearly limit on service credits. Keep the right to end the agreement if the service keeps falling short.", status: "Suggested position", icon: MessageSquareText, detail: "Negotiation note · Service levels", note: "Your team decides whether to propose this wording." },
  { label: "Decision", title: "Aisha has asked for changes", body: "Aisha asked Chidi to send the revised clause to Helen at Barton. The note links back to Clause 8.4 so they can follow up on the same wording.", status: "Human decision", icon: ShieldCheck, detail: "Aisha Bello · Assigned to Chidi", note: "A fictional decision for this walkthrough." },
]

export default function ReviewDemo({ sampleUrl }) {
  const [active, setActive] = useState(0)
  const panelRef = usePanelMotion(active)
  const layer = layers[active]
  const Icon = layer.icon
  function onTabKey(event, index) {
    let next = index
    if (event.key === "ArrowRight") next = (index + 1) % layers.length
    else if (event.key === "ArrowLeft") next = (index + layers.length - 1) % layers.length
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = layers.length - 1
    else return
    event.preventDefault()
    setActive(next)
    document.getElementById(`review-tab-${next}`)?.focus()
  }
  return <div className="review-demo">
    <div className="demo-bar"><span><LensMark /> Adebayo Foods <ChevronRight aria-hidden="true" /> <strong>Barton IT support</strong></span><span className="demo-label">Interactive preview</span></div>
    <div className="review-layout">
      <aside className="demo-sidebar" aria-label="Sample agreement overview">
        <div className="workspace-name"><span className="workspace-avatar">B</span><div>Barton IT Services<small>IT support agreement</small></div></div>
        <div className="sidebar-section">REVIEW</div>
        <div className="sidebar-item selected"><FileText aria-hidden="true" /> Overview</div>
        <div className="sidebar-item"><CircleAlert aria-hidden="true" /> Findings <span>6</span></div>
        <div className="sidebar-item"><MessageSquareText aria-hidden="true" /> Ask a question</div>
        <div className="sidebar-item"><ListChecks aria-hidden="true" /> Decisions</div>
        <div className="sidebar-bottom"><span className="avatar">AB</span><div>Aisha Bello<small>Reviewer</small></div><PanelLeft aria-hidden="true" /></div>
      </aside>
      <div className="document-area">
        <div className="document-toolbar"><span><FileText aria-hidden="true" /> Source document</span><span>12 of 28</span></div>
        <article className="document-paper">
          <div className="paper-meta"><span>BARTON IT SERVICES LTD</span><span>IT SUPPORT AGREEMENT</span></div>
          <h3>8. Service levels<br /> and credits</h3>
          <p><span>8.3</span> Supplier will measure availability for each calendar month and report performance within five business days.</p>
          <div className="clause-highlight"><span className="clause-pin"><Link2 aria-hidden="true" /></span><p><span>8.4</span> Where a Service Level is not met, Customer may claim the applicable Service Credit for each affected service and reporting period.</p></div>
          <p><span>8.5</span> Service Credits do not limit Customer’s right to terminate for persistent material failure.</p>
          <div className="paper-footer"><span>Confidential · Sample document</span><span>12</span></div>
        </article>
      </div>
      <aside className="review-inspector">
        <div className="inspector-top"><span className="finding-indicator"><CircleAlert aria-hidden="true" /> Finding 03</span><span>of 06</span></div>
        <div className="review-tabs" role="tablist" aria-label="Explore the review layers">
          {layers.map((item, index) => <button key={item.label} type="button" role="tab" id={`review-tab-${index}`} aria-controls="review-panel" aria-selected={active === index} tabIndex={active === index ? 0 : -1} onKeyDown={(event) => onTabKey(event, index)} onClick={() => setActive(index)}>{item.label}</button>)}
        </div>
        <div ref={panelRef} className="review-panel" role="tabpanel" id="review-panel" aria-labelledby={`review-tab-${active}`} tabIndex={0}>
          <span className={`review-status state-${active}`}><Icon aria-hidden="true" /> {layer.status}</span>
          <h3>{layer.title}</h3><p>{layer.body}</p>
          <div className="source-reference"><Link2 aria-hidden="true" /><div><strong>{layer.detail}</strong><span>Linked to source evidence</span></div><Check aria-hidden="true" /></div>
          <p className="review-caution">{layer.note}</p>
          <a className="text-link" href={sampleUrl}>Explore the full review <ArrowRight aria-hidden="true" /></a>
        </div>
        <div className="inspector-foot"><ShieldCheck aria-hidden="true" /> Evidence stays attached.</div>
      </aside>
    </div>
  </div>
}
