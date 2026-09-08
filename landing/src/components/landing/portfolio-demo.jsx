import { useState } from "react"
import { usePanelMotion } from "../../hooks/use-panel-motion"
import { ArrowRight, FileText, Link2, Search } from "lucide-react"

const questions = [
  { label: "Renewals", question: "Which agreements renew automatically?", answer: "Two sample agreements include automatic renewal. Harborline requires 60 days’ notice; Northstar requires 90 days.", sources: [{ name: "Harborline supply agreement", location: "Clause 11.2", quote: "The Term will renew for successive periods unless either party gives not less than sixty (60) days’ written notice." }, { name: "Northstar services order", location: "Page 8", quote: "This Order renews annually unless written notice is received at least ninety days before the renewal date." }] },
  { label: "Service credits", question: "Is there a cap on service credits?", answer: "No aggregate cap was found in Harborline’s service-credit clause. Check the complete agreement and related schedules before concluding that no cap applies.", sources: [{ name: "Harborline supply agreement", location: "Clause 8.4", quote: "Customer may claim the applicable Service Credit for each affected service and reporting period." }] },
  { label: "Termination", question: "Can we terminate for repeated service failures?", answer: "Harborline preserves a right to terminate for persistent material failure. The full agreement should be reviewed for the applicable process and notice requirements.", sources: [{ name: "Harborline supply agreement", location: "Clause 8.5", quote: "Service Credits do not limit Customer’s right to terminate for persistent material failure." }] },
]
export default function PortfolioDemo({ sampleUrl }) {
  const [active, setActive] = useState(0)
  const panelRef = usePanelMotion(active)
  const query = questions[active]
  return <div className="portfolio-demo">
    <div className="portfolio-heading"><span><Search aria-hidden="true" /> Portfolio questions</span><span>Sample answers</span></div>
    <div className="query-options" role="group" aria-label="Choose a sample portfolio question">{questions.map((question, index) => <button type="button" key={question.label} aria-pressed={active === index} onClick={() => setActive(index)}>{question.label}</button>)}</div>
    <div className="sample-question"><span>{query.question}</span><Search aria-hidden="true" /></div>
    <div ref={panelRef} className="portfolio-answer" aria-live="polite"><div className="answer-heading"><span className="answer-symbol"><Link2 aria-hidden="true" /></span><strong>Here’s what the sources say.</strong></div><p>{query.answer}</p><div className="answer-sources">{query.sources.map((source, index) => <a href={sampleUrl} className="answer-source" key={source.name}><div><span><FileText aria-hidden="true" /> {source.name}</span><span>{source.location} <ArrowRight aria-hidden="true" /></span></div><blockquote>{source.quote}</blockquote><span className="source-number">{index + 1}</span></a>)}</div></div>
    <p className="portfolio-disclosure">Preset examples from synthetic documents. Open the sample to explore the review.</p>
  </div>
}
