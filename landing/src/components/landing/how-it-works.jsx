import { CalendarClock, FileText, Quote, UsersRound } from "lucide-react"

function Badge({ icon: Icon, tone }) {
  return <span className={`how-badge how-badge-${tone}`} aria-hidden="true"><Icon /></span>
}

export function HowItWorksHeading() {
  return <div className="how-heading" data-motion="closing">
    <p className="how-eyebrow">How it works</p>
    <h2 id="how-title">LensLayer <span className="how-keep">reads <Badge icon={FileText} tone="blue" /></span> every contract{" "}<br />and <span className="how-keep">points <Badge icon={Quote} tone="yellow" /></span> to the clause.{" "}<br /><span className="how-muted">Your <span className="how-keep">team <Badge icon={UsersRound} tone="pink" /></span> makes the call.</span></h2>
  </div>
}

// Every figure here is a fact about the product or the demo workspace, not a
// marketing metric. The people are the demo's fictional team.
const reviewers = [["AB", "Aisha Bello"], ["CO", "Chidi Okafor"], ["TA", "Tomi Adeyemi"], ["NM", "Nneka Mensah"]]

export default function HowItWorksGrid() {
  return <div className="how-grid">
    <article className="how-card how-card-image">
      <picture>
        <source type="image/avif" srcSet="/how/renewals-calendar.avif" />
        <img src="/how/renewals-calendar.webp" width="666" height="526" loading="lazy" decoding="async" alt="The Renewals calendar in the demo workspace, with tasks on 4 and 19 November and today, 10 November, marked" />
      </picture>
      <span className="how-card-icon" aria-hidden="true"><CalendarClock /></span>
      <div className="how-card-overlay">
        <p className="how-figure">60 days</p>
        <p>Loopback’s notice period. The review found it in Section 3.2, and it’s on the calendar with a reminder.</p>
      </div>
    </article>

    <article className="how-card how-card-grey">
      <p className="how-label">Ways to answer a review request</p>
      <p className="how-figure">4</p>
      <p className="how-caption">Approve, approve with conditions, ask for changes or reject. Each one needs a reason.</p>
      <div className="how-people">
        <ul aria-label="Reviewers in the demo workspace">{reviewers.map(([initials, name]) => <li key={initials} title={name}><span aria-hidden="true">{initials}</span><span className="sr-only">{name}</span></li>)}</ul>
        <blockquote>“I’ve sent Helen our cap wording. She needs finance to sign it off. Chidi, please chase her before we sign the renewal.”</blockquote>
        <p className="how-attribution">Aisha Bello, on the Loopback review in the demo</p>
      </div>
    </article>

    <article className="how-card how-card-yellow">
      <p className="how-label">File types you can upload</p>
      <p className="how-figure">3</p>
      <p className="how-caption">PDF, Word and plain text. Each file is checked for malware before it’s opened.</p>
    </article>

    <article className="how-card how-card-dark">
      <p className="how-label">Reminders can go out up to</p>
      <p className="how-figure">90 days</p>
    </article>
  </div>
}
