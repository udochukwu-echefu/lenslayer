import { ArrowRight, Clock3, EyeOff, Trash2 } from "lucide-react"

const points = [
  { icon: EyeOff, title: "We don’t train on them", copy: "Your documents aren’t used to train AI models. There’s no advertising, analytics or session recording, here or in the app." },
  { icon: Clock3, title: "We don’t keep them for long", copy: "Uploaded files are deleted when the review finishes, unless your workspace chooses to keep originals. Kept files expire after 30 days unless you change that." },
  { icon: Trash2, title: "You can delete them", copy: "Delete a contract from its page, or delete your account in Settings. If you’re the only member of a workspace, it goes too, files and all." },
]

export default function PrivacySection() {
  return <section className="privacy-section shell" id="privacy" aria-labelledby="privacy-title">
    <div className="privacy-card" data-motion="stage">
      <div className="privacy-intro">
        <h2 id="privacy-title">What happens<br />to your files.</h2>
        <p>This is the short version. The privacy policy has the full one, including every company that handles your data.</p>
        <div className="privacy-links"><a className="text-link" href="/privacy">Privacy policy <ArrowRight aria-hidden="true" /></a><a className="text-link" href="/terms">Terms <ArrowRight aria-hidden="true" /></a></div>
      </div>
      <ul className="privacy-points">
        {points.map(({ icon: Icon, title, copy }) => <li key={title}>
          <span className="control-card-icon" aria-hidden="true"><Icon /></span>
          <div><h3>{title}</h3><p>{copy}</p></div>
        </li>)}
      </ul>
    </div>
  </section>
}
