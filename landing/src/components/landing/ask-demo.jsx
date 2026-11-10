import { useId, useState } from "react"
import { ArrowUpRight, FileText, FileWarning } from "lucide-react"

// One question asked across the demo workspace's fictional contracts. The
// answer, clause references and quotes come from the demo data in the app.
const sources = [
  {
    chip: "Loopback § 3.2",
    line: "Loopback IT support renews every year. Written notice is due 60 days before.",
    title: "Loopback IT support agreement",
    location: "Section 3.2 · Revised draft",
    contract: "demo-msa",
    quote: { before: "The Term shall renew automatically unless either party gives ", mark: "not less than 60 days' written notice", after: "." },
  },
  {
    chip: "Workset Order Form",
    line: "Workset Payroll renews at the end of each term, also with 60 days’ notice.",
    title: "Workset Payroll annual subscription",
    location: "Order Form · Term",
    contract: "demo-software",
    quote: { before: "Either party may prevent renewal by providing written notice ", mark: "at least 60 days before the end of the current subscription term", after: "." },
  },
  {
    chip: "Lease Sch. 4",
    line: "The Allen Avenue lease runs on unless Worklane gets break notice six months before the break date.",
    title: "28 Allen Avenue office lease",
    location: "Schedule 4, paragraph 2",
    contract: "demo-lease",
    quote: { before: "The break notice must be received at the Landlord's registered office ", mark: "no later than six months before the Break Date", after: "." },
  },
  {
    chip: "Not read",
    line: "Fieldnote’s agreement wasn’t checked. Pages of the scan are cut off.",
    title: "Fieldnote website development agreement",
    location: "Review failed",
    contract: "demo-marketing",
    unread: true,
    note: "There’s no text to quote. Ask Fieldnote for the original PDF and upload it again.",
  },
]

export default function AskDemo({ appUrl }) {
  const [active, setActive] = useState(0)
  const id = useId()
  const source = sources[active]
  const Icon = source.unread ? FileWarning : FileText

  return <div className="ask-stage">
    <div className="ask-card">
      <p className="ask-bubble">Which of our contracts renew on their own, and how much notice do we need?</p>
      <p className="ask-card-title">Renewals and notice</p>
      <ul className="ask-lines" aria-label="Answer, with the clause behind each part">
        {sources.map((item, index) => <li key={item.contract} data-unread={item.unread || undefined}>
          {item.line}{" "}
          <button type="button" className="ask-chip" aria-pressed={active === index} aria-controls={`${id}-source`} aria-label={`Show source: ${item.title}`} onClick={() => setActive(index)}>{item.chip}</button>
        </li>)}
      </ul>
    </div>
    <aside className="ask-source" id={`${id}-source`} aria-live="polite" aria-label="Source" data-unread={source.unread || undefined}>
      <div key={source.contract} className="ask-source-body">
        <div className="ask-source-head"><span className="ask-source-icon" aria-hidden="true"><Icon /></span><div><strong>{source.title}</strong><span>{source.location}</span></div></div>
        {source.quote
          ? <blockquote>“{source.quote.before}<mark>{source.quote.mark}</mark>{source.quote.after}”</blockquote>
          : <p>{source.note}</p>}
        <a href={`${appUrl}/contracts/${source.contract}`}>Open in the demo <ArrowUpRight aria-hidden="true" /></a>
      </div>
    </aside>
  </div>
}
