import { useId, useState } from "react"
import { Plus } from "lucide-react"

const questions = [
  {
    question: "Is the review legal advice?",
    answer: "No. Think of it as a careful first read that points your team at what needs attention and where it is. It can miss things and it can be wrong, so check anything important against the clause itself, and talk to a lawyer before you sign or rely on a contract.",
  },
  {
    question: "What files can I upload?",
    answer: "PDF, Word (.docx) and plain text. If a file can’t be read properly, say a scan with pages cut off, the review tells you so you can upload a better copy.",
  },
  {
    question: "How does LensLayer find renewal and notice dates?",
    answer: "It reads the term, renewal, notice and termination clauses and lists each date next to the clause it came from. If a date depends on something the contract doesn’t state, like a start date, it says so. Nothing gets a reminder until someone on your team confirms the date.",
  },
  {
    question: "Who can see our contracts?",
    answer: "Only people in your workspace. Owners and admins invite them and decide whether each one can view, review or manage the workspace. Every decision shows who made it and why.",
  },
  {
    question: "Are our documents used to train AI models?",
    answer: "No. The text goes to our AI provider only to produce your review and answers. The privacy policy names every company that handles your data and says how long we keep each kind.",
  },
  {
    question: "What is the demo workspace?",
    answer: "A read-only workspace for Relay Software, a made-up company with six contracts. Open it without an account and look through the reviews, answers and renewal dates. Nothing you do there touches a real workspace.",
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
                <span className="faq-question">{item.question}</span>
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
