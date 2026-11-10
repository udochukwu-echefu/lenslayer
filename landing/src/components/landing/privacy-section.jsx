import { ArrowRight, Clock3, EyeOff, Trash2 } from "lucide-react"

const points = [
  { icon: EyeOff, title: "Not used for training", copy: "We don’t use your documents to train AI models. There’s no advertising, analytics or session recording on this site or in the app." },
  { icon: Clock3, title: "Kept only as long as you choose", copy: "Uploaded files are deleted once the review finishes, unless your workspace keeps originals. Kept documents expire after 30 days by default, and you can change that." },
  { icon: Trash2, title: "Deleted when you say", copy: "Delete an agreement from its page, or your whole account from Settings. A workspace where you’re the only member is deleted with all its files." },
]

export default function PrivacySection() {
  return <section className="privacy-section shell" id="privacy" aria-labelledby="privacy-title">
    <div className="privacy-card" data-motion="stage">
      <div className="privacy-intro">
        <h2 id="privacy-title">Your agreements<br />stay yours.</h2>
        <p>What happens to the documents you upload, in short. The privacy policy names every service that handles your data.</p>
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
