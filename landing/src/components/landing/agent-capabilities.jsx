import { useId, useState } from "react"
import { ArrowRight, BadgeCheck, FileSearch, History, ListPlus, UserCheck } from "lucide-react"

const capabilities = [
  { label: "Retrieve", icon: FileSearch, title: "Find the clause behind the follow-up.", detail: "Retrieve retained agreement text within the documents your agent is allowed to read.", method: "documents.retrieve" },
  { label: "Propose", icon: ListPlus, title: "Turn evidence into an exact proposal.", detail: "Supply the source, assignee, and due date for an internal follow-up task.", method: "workspace.tasks.propose" },
  { label: "Approve", icon: UserCheck, title: "Wait for your say-so before acting.", detail: "With approval enabled, a workspace owner or administrator reviews the exact input. The agent cannot approve itself.", method: "awaiting_approval" },
  { label: "Verify", icon: BadgeCheck, title: "Check the result, not the promise.", detail: "LensLayer reads the created task back before recording verified completion. Task creation is not the renewal being handled.", method: "database_read_back" },
  { label: "Inspect", icon: History, title: "Keep a record you can follow.", detail: "Inspect the run’s ordered events, proposed actions, and retained evidence references.", method: "runs.events" },
]

export default function AgentCapabilities({ docsUrl, sampleUrl }) {
  const [active, setActive] = useState(0)
  const id = useId()
  const capability = capabilities[active]

  return <section className="agent-section shell" id="agents" aria-labelledby={`${id}-title`}>
    <div className="agent-panel">
      <h2 id={`${id}-title`}>Your agent can act.<br />You decide how far.</h2>
      <div className="agent-capability-options" role="group" aria-label="Explore the agent workflow">
        {capabilities.map(({ label, icon: Icon }, index) => <button type="button" key={label} className="agent-capability-option" aria-pressed={active === index} aria-controls={`${id}-example`} onClick={() => setActive(index)}>
          <span className="agent-capability-icon"><Icon aria-hidden="true" /></span><span>{label}</span>
        </button>)}
      </div>
      <div className="agent-example" id={`${id}-example`} aria-live="polite" aria-atomic="true">
        <div key={capability.label} className="agent-example-content"><h3>{capability.title}</h3><code>{capability.method}</code><p>{capability.detail}</p></div>
      </div>
      <p className="agent-connection-copy">Connect your server-side agent through REST, the local SDK, or stdio MCP. Use a scoped credential, not your workspace sign-in. Human approval stays in your workspace.</p>
      <div className="agent-resource-links"><a href={`${docsUrl}#client`}>Client setup <ArrowRight aria-hidden="true" /></a><a href={`${docsUrl}#scope`}>Permission guide <ArrowRight aria-hidden="true" /></a><a href={sampleUrl}>Explore sample runs <ArrowRight aria-hidden="true" /></a></div>
    </div>
  </section>
}
