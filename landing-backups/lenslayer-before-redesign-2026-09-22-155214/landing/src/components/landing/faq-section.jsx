import { useId, useState } from "react"
import { Plus } from "lucide-react"

const questions = [
  {
    question: "Which document types can I review?",
    answer: "LensLayer accepts PDF, DOCX, and TXT agreements. The sample review lets you explore the workflow before using one of your own documents.",
  },
  {
    question: "Can I see where a finding came from?",
    answer: "Yes. Findings and portfolio answers stay connected to the relevant clause, page, and source excerpt so you can inspect the evidence in context.",
  },
  {
    question: "Can I ask questions across several agreements?",
    answer: "Yes. Portfolio questions can compare terms across agreements and show the excerpts used for the answer, including where the available evidence is incomplete.",
  },
  {
    question: "What happens to the documents I upload?",
    answer: "You can choose original-document and source-text retention for each review, apply workspace defaults, and delete records you no longer need. Grounded questions require retained source text.",
  },
  {
    question: "Can a team work on the same review?",
    answer: "Workspace roles define who can review, upload, and approve. Decisions can include an owner and rationale so the next person can follow the record.",
  },
  {
    question: "Can I try LensLayer without signing up?",
    answer: "Yes. Open the public sample to explore findings, next moves, decisions, and source evidence without creating an account or uploading a document.",
  },
]

export default function FaqSection() {
  const [openItem, setOpenItem] = useState(0)
  const sectionId = useId()

  return <section className="faq-section" id="faq" aria-labelledby={`${sectionId}-title`}>
    <div className="shell faq-grid">
      <div className="faq-intro" data-motion="copy-left">
        <h2 id={`${sectionId}-title`}>Questions before the first review?</h2>
        <p>The practical details about documents, evidence, collaboration, and trying the product.</p>
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
