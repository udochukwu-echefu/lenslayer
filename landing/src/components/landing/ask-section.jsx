import { ArrowUpRight, CircleAlert, Quote, Search } from "lucide-react"

function Badge({ icon: Icon, tone }) {
  return <span className={`ask-badge ask-badge-${tone}`} aria-hidden="true"><Icon /></span>
}

export function AskHeading() {
  return <div className="ask-heading" data-motion="closing">
    <p className="ask-eyebrow">Ask</p>
    <h2 id="ask-title"><span className="ask-keep">Ask <Badge icon={Search} tone="blue" /></span> across your contracts{" "}<br />and get <span className="ask-keep">the clause <Badge icon={Quote} tone="yellow" /></span> back.{" "}<br /><span className="ask-muted">If it <span className="ask-keep">isn’t there <Badge icon={CircleAlert} tone="pink" />,</span> it says so.</span></h2>
  </div>
}

// The questions Ask suggests in every workspace.
const suggestions = ["Which agreements renew automatically?", "Where are liability caps missing or unclear?", "Which notice deadlines fall in the next 60 days?"]

// A drawn page, not a screenshot: the line widths are decorative and the
// highlighted sentence is a generic renewal clause, not anyone's contract.
const lines = [92, 100, 84, 96, 70]

export default function AskGrid({ signInUrl }) {
  return <div className="ask-grid">
    <article className="ask-card ask-card-image">
      <div className="ask-page" aria-hidden="true">
        <p className="ask-page-heading">3. Term and renewal</p>
        {lines.slice(0, 3).map((width, index) => <span className="ask-page-line" style={{ width: `${width}%` }} key={index} />)}
        <p className="ask-page-clause"><span>3.2</span> <mark>This agreement renews automatically for further one-year terms unless either party gives written notice at least 60 days before the current term ends.</mark></p>
        {lines.slice(3).map((width, index) => <span className="ask-page-line" style={{ width: `${width}%` }} key={index} />)}
      </div>
      <span className="ask-card-icon" aria-hidden="true"><Search /></span>
      <div className="ask-card-overlay">
        <p className="ask-figure">1 click</p>
        <p>From an answer to the contract it quotes, with the section and page named.</p>
      </div>
    </article>

    <article className="ask-card ask-card-grey">
      <p className="ask-label">Contracts one question covers</p>
      <p className="ask-figure">All</p>
      <p className="ask-caption">Ask about one contract, or every reviewed contract in your workspace at once.</p>
      <div className="ask-quote">
        <p className="ask-attribution">Questions to start with</p>
        <ul className="ask-suggestions">{suggestions.map((question) => <li key={question}>{question}</li>)}</ul>
      </div>
    </article>

    <article className="ask-card ask-card-yellow">
      <p className="ask-label">File types Ask can read</p>
      <p className="ask-figure">3</p>
      <p className="ask-caption">PDF, Word and plain text, once a contract’s review has finished.</p>
    </article>

    <a className="ask-card ask-card-dark" href={signInUrl}>
      <span className="ask-label">Ask about your own contracts</span>
      <span className="ask-figure">Sign in <ArrowUpRight aria-hidden="true" /></span>
    </a>
  </div>
}
