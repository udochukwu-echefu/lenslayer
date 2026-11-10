import { ArrowUpRight, CircleAlert, FileText, Quote, Search } from "lucide-react"

function Badge({ icon: Icon, tone }) {
  return <span className={`ask-badge ask-badge-${tone}`} aria-hidden="true"><Icon /></span>
}

export function AskHeading() {
  return <div className="ask-heading" data-motion="closing">
    <p className="ask-eyebrow">Ask</p>
    <h2 id="ask-title"><span className="ask-keep">Ask <Badge icon={Search} tone="blue" /></span> across your contracts{" "}<br />and get <span className="ask-keep">the clause <Badge icon={Quote} tone="yellow" /></span> back.{" "}<br /><span className="ask-muted">If it <span className="ask-keep">isn’t there <Badge icon={CircleAlert} tone="pink" />,</span> it says so.</span></h2>
  </div>
}

// Every figure is a fact about the demo answer shown in the screenshot, not a
// marketing metric.
const sources = ["Loopback IT support agreement", "28 Allen Avenue office lease", "Workset Payroll annual subscription"]

export default function AskGrid({ askUrl }) {
  return <div className="ask-grid">
    <article className="ask-card ask-card-image">
      <picture>
        <source type="image/avif" srcSet="/ask/ask-answer.avif" />
        <img src="/ask/ask-answer.webp" width="960" height="667" loading="lazy" decoding="async" alt="Ask in the demo workspace, answering which contracts renew automatically and what notice is needed, with the Loopback IT support agreement quoted as the first source" />
      </picture>
      <span className="ask-card-icon" aria-hidden="true"><Search /></span>
      <div className="ask-card-overlay">
        <p className="ask-figure">60 days</p>
        <p>Loopback’s notice period, quoted word for word from Section 3.2 on page 5.</p>
      </div>
    </article>

    <article className="ask-card ask-card-grey">
      <p className="ask-label">Contracts in the demo workspace</p>
      <p className="ask-figure">6</p>
      <p className="ask-caption">One question looks across all the reviewed ones at once, not just the contract you have open.</p>
      <div className="ask-quote">
        <ul aria-label="Contracts quoted in this answer">{sources.map((title) => <li key={title} title={title}><FileText aria-hidden="true" /><span className="sr-only">{title}</span></li>)}</ul>
        <blockquote>“Loopback needs 60 days’ notice before the IT support agreement renews. For the Allen Avenue lease, Worklane must receive a break notice six months before the break date.”</blockquote>
        <p className="ask-attribution">The answer Ask gave in the demo workspace</p>
      </div>
    </article>

    <article className="ask-card ask-card-yellow">
      <p className="ask-label">Sources quoted in that answer</p>
      <p className="ask-figure">3</p>
      <p className="ask-caption">Each one names the contract, the section and the page, so you can check the wording yourself.</p>
    </article>

    <a className="ask-card ask-card-dark" href={askUrl}>
      <span className="ask-label">Try it on the demo contracts</span>
      <span className="ask-figure">Open Ask <ArrowUpRight aria-hidden="true" /></span>
    </a>
  </div>
}
