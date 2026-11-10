import { useId, useState } from "react"
import { Plus } from "lucide-react"

const questions = [
  {
    question: "Is the review legal advice?",
    answer: "No. It’s a first pass that shows your team what needs attention and where it sits in the agreement. It can miss things and it can be wrong, so check important findings against the clause itself and ask a qualified lawyer before you sign or rely on a contract.",
  },
  {
    question: "What files can I upload?",
    answer: "PDF, Word (.docx) and plain-text files. If a file can’t be read properly, such as a scan with pages cut off, the review says so and you can upload a better copy.",
  },
  {
    question: "How does LensLayer find renewal and notice dates?",
    answer: "The review reads the term, renewal, notice and termination clauses and lists each date with the clause it came from. If a date depends on something the document doesn’t state, the review says that too. A person on your team checks a date before it gets an owner and a reminder.",
  },
  {
    question: "Who can see our agreements?",
    answer: "Only members of your workspace. Owners and admins invite people and set what each person can do, from viewing to reviewing to administering the workspace. Every decision records who made it and why.",
  },
  {
    question: "Are our documents used to train AI models?",
    answer: "No. Document text goes to our AI model provider only to produce your review and answers. The privacy policy lists every service that handles your data and how long each kind of data is kept.",
  },
  {
    question: "What is the demo workspace?",
    answer: "A read-only workspace for a fictional company, Relay Software, with six sample agreements. Open it without an account to look through reviews, answers and renewal dates. Nothing you do there affects a real workspace.",
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
