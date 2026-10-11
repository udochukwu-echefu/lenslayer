import { useState } from "react"
import { usePanelMotion } from "../../hooks/use-panel-motion"
import { ArrowRight } from "lucide-react"

const questions = [
  { label: "Evidence", question: "How much notice does Loopback need?", answer: "The latest IT support draft says 60 days before the annual renewal. The agent retrieves that clause and its source version, so Aisha can check the wording before approving a follow-up.", sources: [{ name: "Loopback IT support agreement", location: "Section 3.2 · Revised draft", quote: "The Term shall renew automatically unless either party gives not less than 60 days' written notice." }] },
  { label: "Approval", question: "Who will handle the renewal decision?", answer: "The agent proposes a task for Chidi, due five days before the notice deadline. Aisha checks the assignee, date and instructions before approving it. The proposal waits until she makes that decision.", sources: [{ name: "Proposed follow-up for Chidi", location: "Awaiting Aisha's approval", quote: "Confirm the Loopback renewal decision with Aisha. Check whether we want another year of IT support." }] },
  { label: "Receipt", question: "Was Chidi's follow-up created?", answer: "After approval, LensLayer creates the task and reads it back to check the assignee and due date. The run records the result. Chidi still needs to speak with Aisha and handle the renewal decision.", sources: [{ name: "Task creation receipt", location: "Sample completed run", quote: "Follow-up created for Chidi. Renewal decision still outstanding." }] },
]
export default function PortfolioDemo({ sampleUrl }) {
  const [active, setActive] = useState(0)
  const panelRef = usePanelMotion(active)
  const query = questions[active]
  return (
    <div className="portfolio-demo">
      <div className="portfolio-toolbar">
        <p className="portfolio-label">Relay Software · fictional example</p>
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
      <p className="portfolio-disclosure">This is a fictional walkthrough. Open the sample run to see its source, approval and task receipt.</p>
    </div>
  )
}
