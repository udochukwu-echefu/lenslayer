import { useState } from "react"
import { usePanelMotion } from "../../hooks/use-panel-motion"
import { ArrowRight } from "lucide-react"

const questions = [
  { label: "Evidence", question: "Retrieve the retained renewal clause", answer: "Literal phrase retrieval returns a source excerpt with a version, extracted-text hash, and offsets. The receipt identifies the source; it does not prove a legal interpretation.", sources: [{ name: "Synthetic retained agreement", location: "Source excerpt", quote: "The Term shall renew automatically unless either party gives not less than 120 days’ written notice." }] },
  { label: "Approval", question: "Inspect the exact follow-up task", answer: "Check the allowed assignee and explicit due instant against the run’s success condition. A pending proposal stops for a human decision; an agent cannot turn source instructions into approval.", sources: [{ name: "Immutable task input", location: "Human review", quote: "Review renewal notice deadline. Confirm whether to renew before sending notice." }] },
  { label: "Receipt", question: "Verify task creation, not task performance", answer: "A succeeded run records the task ID, evidence reference, verified=true, and database_read_back. Queued, accepted, or awaiting_approval does not mean the action executed.", sources: [{ name: "Completion receipt", location: "Sample run", quote: "Outcome: follow-up task created. The renewal itself is not handled." }] },
]
export default function PortfolioDemo({ sampleUrl }) {
  const [active, setActive] = useState(0)
  const panelRef = usePanelMotion(active)
  const query = questions[active]
  return (
    <div className="portfolio-demo">
      <div className="portfolio-toolbar">
        <p className="portfolio-label">Illustrative workflow · synthetic data</p>
        <div className="query-options" role="group" aria-label="Inspect an illustrative workflow stage">
          {questions.map((question, index) => (
            <button type="button" key={question.label} aria-pressed={active === index} aria-controls="portfolio-example" onClick={() => setActive(index)}>
              {question.label}
            </button>
          ))}
        </div>
      </div>
      <div ref={panelRef} className="portfolio-answer" id="portfolio-example" aria-live="polite">
        <h3 className="sample-question">{query.question}</h3>
        <p>{query.answer}</p>
        <div className="answer-sources">
          <p>{active === 0 ? "Retained source" : "Workflow record"}</p>
          {query.sources.map((source) => (
            <a href={sampleUrl} className="answer-source" key={source.name}>
              <div><span>{source.name}</span><span>{source.location} <ArrowRight aria-hidden="true" /></span></div>
              <blockquote>“{source.quote}”</blockquote>
            </a>
          ))}
        </div>
      </div>
      <p className="portfolio-disclosure">Static illustrations, not live executions. Open Runs to inspect the read-only synthetic ledger.</p>
    </div>
  )
}
