import { useId, useState } from "react"
import { ArrowUpRight, ChevronDown } from "lucide-react"

// One question asked across the demo workspace's fictional agreements. The
// answer, clause references and quotes come from the demo data in the app.
const rows = [
  {
    agreement: "Loopback IT support",
    party: "Loopback IT",
    finding: "Renews every year. 60 days’ written notice to stop it.",
    clause: "§ 3.2",
    contract: "demo-msa",
    quote: { before: "The Term shall renew automatically unless either party gives ", mark: "not less than 60 days' written notice", after: "." },
  },
  {
    agreement: "Workset Payroll subscription",
    party: "Workset Payroll",
    finding: "Renews every year. 60 days’ written notice before the term ends.",
    clause: "Order Form",
    contract: "demo-software",
    quote: { before: "Either party may prevent renewal by providing written notice ", mark: "at least 60 days before the end of the current subscription term", after: "." },
  },
  {
    agreement: "28 Allen Avenue lease",
    party: "Worklane Offices",
    finding: "Runs on unless we use the break. Notice must arrive six months ahead.",
    clause: "Sch. 4, para. 2",
    contract: "demo-lease",
    quote: { before: "The break notice must be received at the Landlord's registered office ", mark: "no later than six months before the Break Date", after: "." },
  },
  {
    agreement: "Fieldnote website build",
    party: "Fieldnote Studio",
    finding: "Not checked. Pages of the scan are cut off.",
    clause: "No text",
    contract: "demo-marketing",
    unread: true,
    note: "There’s nothing to quote until Fieldnote sends a complete copy. The review is marked as failed, so it won’t be mistaken for a clean result.",
  },
]

export default function AskDemo({ appUrl }) {
  const [open, setOpen] = useState(0)
  const id = useId()

  return <figure className="ask-sheet" aria-labelledby={`${id}-question`}>
    <div className="ask-sheet-bar"><span>Ask</span><span>Relay Software demo · 6 contracts</span></div>
    <div className="ask-exchange">
      <p className="ask-label">Question</p>
      <p className="ask-question" id={`${id}-question`}>Which of our contracts carry on by themselves, and how do we stop them?</p>
      <p className="ask-label ask-label-answer">Answer</p>
      <p className="ask-answer">Two renew every year: Loopback and Workset each need 60 days’ written notice. The Allen Avenue lease keeps going unless Worklane gets break notice six months before the break date. Fieldnote couldn’t be checked because the scan is incomplete.</p>
    </div>
    <ol className="ask-rows" aria-label="Where the answer comes from">
      {rows.map((row, index) => {
        const isOpen = open === index
        const panelId = `${id}-source-${index}`
        return <li className="ask-row" data-open={isOpen} data-unread={row.unread || undefined} key={row.contract}>
          <button type="button" aria-expanded={isOpen} aria-controls={panelId} onClick={() => setOpen(isOpen ? null : index)}>
            <span className="ask-row-name"><strong>{row.agreement}</strong><span>{row.party}</span></span>
            <span className="ask-row-finding">{row.finding}</span>
            <span className="ask-row-clause">{row.clause}</span>
            <ChevronDown className="ask-row-chevron" aria-hidden="true" />
          </button>
          <div className="ask-row-source" id={panelId} hidden={!isOpen}>
            {row.quote
              ? <blockquote>“{row.quote.before}<mark>{row.quote.mark}</mark>{row.quote.after}”</blockquote>
              : <p className="ask-row-note">{row.note}</p>}
            <a href={`${appUrl}/contracts/${row.contract}`}>Open {row.agreement} in the demo <ArrowUpRight aria-hidden="true" /></a>
          </div>
        </li>
      })}
    </ol>
    <figcaption className="ask-sheet-foot">An example from the demo workspace. The companies and contracts are made up.</figcaption>
  </figure>
}
