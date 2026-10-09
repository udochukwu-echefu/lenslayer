const steps = [
  {
    label: "Retain & scope",
    copy: "Keep source text and delegate only the document, tools, and assignee this workflow needs. Set an expiry and a one-action budget.",
  },
  {
    label: "Retrieve & propose",
    copy: "Your client creates a run, retrieves a versioned evidence receipt, and proposes an exact task with explicit factual dates and a stable key.",
  },
  {
    label: "Inspect & approve",
    copy: "When approval is required, a workspace owner or administrator checks the source and immutable task input. The agent cannot approve itself.",
  },
  {
    label: "Execute & verify",
    copy: "The worker creates the internal task, reads its fields back, and records the receipt and ordered events. Accepted proposals are not completed actions.",
  },
]

export default function WorkflowCards() {
  return (
    <ol className="workflow-cards" aria-label="First verified agent workflow">
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
