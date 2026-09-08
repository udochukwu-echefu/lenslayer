import { useState } from "react"
import { usePanelMotion } from "../../hooks/use-panel-motion"
import { ArrowRight, Check, CheckCheck, FileText, GitCompareArrows, Link2, MessageSquareText, CalendarDays } from "lucide-react"

const steps = [
  { label: "Review", copy: "Find risks, obligations, and missing terms. Open the source behind each finding before choosing your next move." },
  { label: "Negotiate", copy: "Build ranked asks, compare revisions, and prepare suggested language with your team’s playbook in view." },
  { label: "Decide", copy: "Give every approval an owner and a rationale. Keep the conversation, evidence, and counsel handoff together." },
  { label: "Follow through", copy: "Turn confirmed terms into assigned tasks, renewal reminders, and notice windows your team can track." },
]

function StageContent({ active }) {
  if (active === 0) return <>
    <div className="stage-title"><FileText aria-hidden="true" /><div><small>Harborline supply agreement</small><h3>The review, at a glance.</h3></div></div>
    <div className="finding-row"><span className="severity">Review</span><div><strong>Uncapped service credits</strong><small>Service levels · Clause 8.4</small></div><Link2 aria-hidden="true" /></div>
    <div className="finding-row"><span className="severity">Review</span><div><strong>Automatic renewal</strong><small>Term and renewal · Clause 11.2</small></div><Link2 aria-hidden="true" /></div>
    <div className="finding-row"><span className="severity quiet">Verify</span><div><strong>Notice delivery method</strong><small>Notices · Clause 14.1</small></div><Link2 aria-hidden="true" /></div>
    <div className="stage-bottom"><CheckCheck aria-hidden="true" /> Every finding has a place to start.</div>
  </>
  if (active === 1) return <>
    <div className="stage-title"><GitCompareArrows aria-hidden="true" /><div><small>Service credits · Clause 8.4</small><h3>A clearer counterproposal.</h3></div></div>
    <div className="revision"><span>Original language</span><p>Customer may claim the applicable Service Credit for each affected service and reporting period.</p></div>
    <div className="revision revised"><span><Check aria-hidden="true" /> Suggested addition</span><p>Aggregate Service Credits shall not exceed <mark>15% of the annual fees</mark> payable under this Agreement.</p></div>
    <div className="stage-bottom"><Link2 aria-hidden="true" /> Suggested language for your team to review.</div>
  </>
  if (active === 2) return <>
    <div className="stage-title"><MessageSquareText aria-hidden="true" /><div><small>Review conversation</small><h3>Context that carries forward.</h3></div></div>
    <div className="conversation"><span className="avatar">MC</span><div><strong>Maya Chen <small>Reviewer</small></strong><p>Let’s propose the annual cap and keep the termination right. Daniel, can you take this into the next round?</p><span className="inline-source"><Link2 aria-hidden="true" /> Service credits · §8.4</span></div></div>
    <div className="decision-stamp"><CheckCheck aria-hidden="true" /><div><strong>Changes requested</strong><small>Owner: Daniel · Rationale recorded</small></div></div>
    <div className="stage-bottom"><Check aria-hidden="true" /> Automation recommends. People decide.</div>
  </>
  return <>
    <div className="stage-title"><CalendarDays aria-hidden="true" /><div><small>Agreement follow-through</small><h3>Nothing lost at handoff.</h3></div></div>
    <div className="follow-task"><span className="task-box"><Check aria-hidden="true" /></span><div><strong>Record the agreed credit cap</strong><small>Daniel · Negotiation outcome</small></div><span className="task-state">Done</span></div>
    <div className="follow-task"><span className="task-box" /><div><strong>Confirm renewal notice owner</strong><small>Maya · Renewal §11.2</small></div><span className="task-state open">To do</span></div>
    <div className="notice-window"><CalendarDays aria-hidden="true" /><div><span>Notice window</span><strong>60 days before renewal</strong><small>Keep the deadline linked to the agreement.</small></div></div>
    <div className="stage-bottom"><Link2 aria-hidden="true" /> From agreed terms to accountable work.</div>
  </>
}

export default function WorkflowDemo({ sampleUrl }) {
  const [active, setActive] = useState(0)
  const panelRef = usePanelMotion(active)
  return <div className="workflow-grid">
    <div className="workflow-steps" role="group" aria-label="Explore the contract workflow">
      {steps.map((step, index) => <button type="button" key={step.label} className={`workflow-step ${active === index ? "is-active" : ""}`} aria-pressed={active === index} aria-controls="workflow-stage" onClick={() => setActive(index)}><span className="step-number">0{index + 1}</span><span><span className="step-label">{step.label}</span><span className="step-copy">{step.copy}</span></span><ArrowRight aria-hidden="true" /></button>)}
    </div>
    <div className="workflow-visual"><p className="mobile-workflow-copy">{steps[active].copy}</p><div ref={panelRef} className="workflow-stage" id="workflow-stage" aria-live="polite"><StageContent active={active} /></div><div className="visual-caption"><span>Illustrative workflow · Synthetic data</span><a href={sampleUrl}>Open sample <ArrowRight aria-hidden="true" /></a></div></div>
  </div>
}
