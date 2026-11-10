const steps = [
  {
    label: "Upload",
    copy: "Add a PDF, Word or text file. Each file is checked for malware before it’s opened, and deleted after the review unless your workspace keeps originals.",
  },
  {
    label: "Review",
    copy: "Get a first pass on risks, obligations, payments and dates, each with the clause it relies on. The review also lists what it couldn’t read or confirm.",
  },
  {
    label: "Decide",
    copy: "Ask a colleague for a decision. They approve, approve with conditions, request changes or reject, and give a reason. Open decisions wait in the Overview queue.",
  },
  {
    label: "Follow through",
    copy: "Turn a finding or a date into a task with an owner and a due date. Renewal and notice dates go on the Renewals calendar with a reminder.",
  },
]

export default function WorkflowCards() {
  return (
    <ol className="workflow-cards" aria-label="How a contract moves through LensLayer">
      {steps.map((step, index) => (
        <li className="workflow-card" key={step.label}>
          <span className="workflow-card-number" aria-hidden="true">0{index + 1}</span>
          <div>
            <h3>{step.label}</h3>
            <p>{step.copy}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
