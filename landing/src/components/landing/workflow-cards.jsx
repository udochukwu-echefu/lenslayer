const steps = [
  {
    label: "Upload",
    copy: "Add a PDF, Word or text file. Each file is checked for malware before it’s opened, and deleted after the review unless your workspace keeps originals.",
  },
  {
    label: "Review",
    copy: "You get a first read of the risks, obligations, payments and dates, each pointing at its clause. Anything it couldn’t read or wasn’t sure about is listed too.",
  },
  {
    label: "Decide",
    copy: "Send it to a colleague. They can approve it, approve it with conditions, ask for changes or reject it, and they have to say why. Anything still waiting sits on the Overview page.",
  },
  {
    label: "Follow through",
    copy: "Turn a finding into a task with an owner and a due date. Renewal and notice dates go on the Renewals calendar, each with a reminder.",
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
