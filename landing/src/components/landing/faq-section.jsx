import { useId, useState } from "react"
import { Plus } from "lucide-react"

const questions = [
  {
    question: "What can an agent do today?",
    answer: "The v1 workflow retrieves retained agreement text by literal phrase and proposes an assigned internal workspace task. A worker verifies task creation by database read-back. General cross-system execution and a live connector catalog are not claimed here.",
  },
  {
    question: "Can I bring my own agent?",
    answer: "Yes. A server-side client uses a scoped bearer credential and the run, evidence, and action API. The SDK is prepared locally, not published on npm. The MCP adapter runs locally over stdio; there is no hosted MCP endpoint or remote OAuth service.",
  },
  {
    question: "Who gives an agent permission to act?",
    answer: "A workspace owner or administrator delegates exact tools, documents, and assignees with an expiry and action limit. Human approval is required by default and binds the exact task input. Neither source text nor model output grants permission.",
  },
  {
    question: "What happens to the documents I upload?",
    answer: "Choose retention when uploading or use workspace defaults. Agent evidence retrieval requires retained source text. Evidence receipts store version, hash, and offsets rather than a copied excerpt; removed or expired text cannot be read back.",
  },
  {
    question: "Does verified mean the renewal was handled?",
    answer: "No. It means the follow-up task was created with the expected assignee, due instant, and source reference at completion. It does not certify legal interpretation, send a notice, or prove the person performed the task.",
  },
  {
    question: "Does LensLayer host a planner for me?",
    answer: "The initial workflow is developer-run. A bounded server-side planner CLI is implemented locally against the same API, but no hosted deployment is offered here. Real product-model use requires a separate opt-in credential and explicit model. Public sample runs are synthetic and read-only.",
  },
]

export default function FaqSection() {
  const [openItem, setOpenItem] = useState(0)
  const sectionId = useId()

  return <section className="faq-section" id="faq" aria-labelledby={`${sectionId}-title`}>
    <div className="shell faq-grid">
      <div className="faq-intro" data-motion="copy-left">
        <h2 id={`${sectionId}-title`}>Questions about LensLayer?</h2>
      </div>
      <div className="faq-list" data-motion="visual-right">
        {questions.map((item, index) => {
          const isOpen = openItem === index
          const answerId = `${sectionId}-answer-${index}`
          return <article className="faq-item" data-open={isOpen} key={item.question}>
            <h3>
              <button type="button" aria-expanded={isOpen} aria-controls={answerId} onClick={() => setOpenItem(isOpen ? null : index)}>
                <span className="faq-number">{String(index + 1).padStart(2, "0")}</span>
                <span>{item.question}</span>
                <span className="faq-toggle" aria-hidden="true"><Plus /></span>
              </button>
            </h3>
            <div className="faq-answer" id={answerId} aria-hidden={!isOpen}>
              <div><p>{item.answer}</p></div>
            </div>
          </article>
        })}
      </div>
    </div>
  </section>
}
