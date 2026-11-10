import { useCallback, useEffect, useId, useRef, useState } from "react"
import { ArrowRight, CircleHelp, FileSearch, Files } from "lucide-react"

// Illustrative questions about the fictional agreements in the demo workspace.
const questions = [
  { label: "Across agreements", tone: "yellow", icon: Files, question: "Which notice deadlines are coming up?", answer: "Loopback IT support renews automatically unless we give 60 days’ written notice. Worklane must receive the Allen Avenue break notice six months before the break date. Both dates are already on the Renewals calendar.", sourceLabel: "Sources", sources: [{ name: "Loopback IT support agreement", location: "Section 3.2 · Revised draft", contract: "demo-msa", quote: "The Term shall renew automatically unless either party gives not less than 60 days' written notice." }, { name: "28 Allen Avenue office lease", location: "Schedule 4, paragraph 2", contract: "demo-lease", quote: "The break notice must be received at the Landlord's registered office no later than six months before the Break Date." }] },
  { label: "One agreement", tone: "pink", icon: FileSearch, question: "Are data claims covered by Loopback’s liability cap?", answer: "No. Section 12.3 makes us liable for data incidents without limit, outside the cap in Section 13.2. Loopback hasn’t agreed to change it yet, and Chidi has a task to settle it before Aisha signs.", sourceLabel: "Source", sources: [{ name: "Loopback IT support agreement", location: "Section 12.3 · Revised draft", contract: "demo-msa", quote: "Customer shall indemnify Supplier against all losses arising from any data incident, without limitation." }] },
  { label: "What’s missing", tone: "blue", icon: CircleHelp, question: "When will Patchworks deliver the new laptops?", answer: "The agreement doesn’t fix a date. Clause 6.4 treats delivery dates as estimates, and the order schedule it refers to wasn’t in the uploaded PDF. Ask Patchworks for the schedule before planning around a date.", sourceLabel: "Closest source", sources: [{ name: "Patchworks equipment supply agreement", location: "Clause 6.4 · Schedule not included", contract: "demo-supplier", quote: "Delivery dates are estimates only and may be revised by Supplier at any time." }] },
]

function CardLighting() {
  const patternId = useId()
  return <div className="portfolio-card-lighting" aria-hidden="true">
    <div className="portfolio-card-glare" />
    <svg className="portfolio-card-foil" viewBox="0 0 400 560" preserveAspectRatio="xMidYMid slice">
      <defs><pattern id={patternId} width="80" height="80" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)">
        <g fill="none" stroke="currentColor" strokeWidth=".9" strokeLinecap="round" strokeLinejoin="round">
          <g transform="translate(10 9)"><path d="M2 0h7l4 4v12H0V2a2 2 0 0 1 2-2Z M9 0v4h4 M3 8h7 M3 11h5" /></g>
          <g transform="translate(47 47)"><path d="m4 10-1 1a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0 M5 3l1-1a3.5 3.5 0 0 1 5 5l-4 4a3.5 3.5 0 0 1-5 0 M2 8l5-5" /></g>
          <g transform="translate(47 9)"><circle cx="6" cy="6" r="6" /><path d="m3 6 2 2 4-4" /></g>
          <g transform="translate(10 49)"><path d="M0 1h12v10H7l-4 3v-3H0Z M3 4h6 M3 7h4" /></g>
        </g>
      </pattern></defs>
      <rect width="400" height="560" fill={`url(#${patternId})`} />
    </svg>
    <div className="portfolio-card-sheen" />
    <div className="portfolio-card-edge" />
  </div>
}

function resetCardLighting(card) {
  if (!card) return
  for (const property of ["transform", "--card-light-x", "--card-light-y", "--card-light-angle", "--card-shadow-x", "--card-shadow-y"]) card.style.removeProperty(property)
  delete card.dataset.lighting
}

export default function PortfolioDemo({ appUrl }) {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const [focused, setFocused] = useState(false)
  const [inView, setInView] = useState(false)
  const [pageVisible, setPageVisible] = useState(() => !document.hidden)
  const [reduceMotion, setReduceMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  const carouselRef = useRef(null)
  const cards = useRef([])
  const swipeStart = useRef(null)
  const swipeClick = useRef(false)
  const lightingFrame = useRef(0)
  const id = useId()
  const running = !paused && !focused && inView && pageVisible && !reduceMotion

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)")
    const onPreference = () => setReduceMotion(preference.matches)
    const onVisibility = () => setPageVisible(!document.hidden)
    preference.addEventListener("change", onPreference)
    document.addEventListener("visibilitychange", onVisibility)
    const observer = window.IntersectionObserver && new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.35 })
    if (observer) observer.observe(carouselRef.current)
    else setInView(true)
    return () => {
      preference.removeEventListener("change", onPreference)
      document.removeEventListener("visibilitychange", onVisibility)
      observer?.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!running) return
    const timer = window.setTimeout(() => setActive((current) => (current + 1) % questions.length), 8000)
    return () => window.clearTimeout(timer)
  }, [active, running])

  const clearLighting = useCallback(() => {
    if (lightingFrame.current) window.cancelAnimationFrame(lightingFrame.current)
    lightingFrame.current = 0
    cards.current.forEach(resetCardLighting)
  }, [])

  useEffect(() => {
    clearLighting()
    return clearLighting
  }, [active, reduceMotion, clearLighting])

  function navigate(direction) {
    setActive((current) => (current + direction + questions.length) % questions.length)
    setPaused(true)
  }

  function tiltCard(event) {
    if (reduceMotion || event.pointerType !== "mouse" || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return
    const { clientX, clientY } = event
    const track = event.currentTarget.querySelector(".portfolio-carousel-track")
    if (lightingFrame.current) window.cancelAnimationFrame(lightingFrame.current)
    lightingFrame.current = window.requestAnimationFrame(() => {
      lightingFrame.current = 0
      const card = cards.current[active]
      if (!card || !track) return
      const bounds = track.getBoundingClientRect()
      const x = Math.max(-1, Math.min(1, (clientX - bounds.left) / bounds.width * 2 - 1))
      const y = Math.max(-1, Math.min(1, (clientY - bounds.top) / bounds.height * 2 - 1))
      card.dataset.lighting = "active"
      card.style.setProperty("--card-light-x", `${(x + 1) * 50}%`)
      card.style.setProperty("--card-light-y", `${(y + 1) * 50}%`)
      card.style.setProperty("--card-light-angle", `${125 + x * 25 - y * 15}deg`)
      card.style.setProperty("--card-shadow-x", `${-x * 12}px`)
      card.style.setProperty("--card-shadow-y", `${20 - y * 7}px`)
      card.style.transform = `translate3d(0,0,20px) rotateX(${-y * 5}deg) rotateY(${x * 7}deg)`
    })
  }

  return (
    <div className="portfolio-carousel" ref={carouselRef} role="region" aria-roledescription="carousel" aria-label="Example questions" onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false) }}>
      <div className="portfolio-carousel-viewport" aria-live={paused || reduceMotion ? "polite" : "off"} onPointerMove={tiltCard} onPointerLeave={clearLighting} onPointerDown={(event) => { if (event.pointerType === "touch") { swipeClick.current = false; swipeStart.current = { x: event.clientX, y: event.clientY } } }} onPointerCancel={() => { swipeStart.current = null; clearLighting() }} onPointerUp={(event) => { if (!swipeStart.current) return; const x = event.clientX - swipeStart.current.x; const y = event.clientY - swipeStart.current.y; swipeStart.current = null; if (Math.abs(x) > 45 && Math.abs(x) > Math.abs(y) * 1.2) { swipeClick.current = true; navigate(x < 0 ? 1 : -1) } }} onClickCapture={(event) => { if (swipeClick.current) { event.preventDefault(); event.stopPropagation(); swipeClick.current = false } }}>
        <div className="portfolio-carousel-track">
          {questions.map((query, index) => {
            const Icon = query.icon
            const position = index === active ? "front" : index === (active + 1) % questions.length ? "right" : "left"
            return <article className="portfolio-demo portfolio-carousel-card" data-position={position} data-tone={query.tone} data-active={active === index} ref={(element) => { cards.current[index] = element }} key={query.label} id={`${id}-slide-${index}`} role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${questions.length}: ${query.label}`} aria-hidden={active !== index} inert={active !== index}>
              <CardLighting />
              <header className="portfolio-card-stage"><Icon aria-hidden="true" /><span>{query.label}</span></header>
              <div className="portfolio-answer">
                <h3 className="sample-question">{query.question}</h3>
                <p>{query.answer}</p>
                <div className="answer-sources">
                  <p>{query.sourceLabel}</p>
                  {query.sources.map((source) => (
                    <a href={`${appUrl}/contracts/${source.contract}`} className="answer-source" key={source.name}>
                      <div><span>{source.name}</span><span>{source.location} <ArrowRight aria-hidden="true" /></span></div>
                      <blockquote>“{source.quote}”</blockquote>
                    </a>
                  ))}
                </div>
              </div>
            </article>
          })}
        </div>
      </div>
      <div className="portfolio-carousel-pagination" role="group" aria-label="Example question cards" onKeyDown={(event) => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); navigate(event.key === "ArrowRight" ? 1 : -1) } }}>
        {questions.map((question, index) => <button type="button" key={question.label} aria-label={`Show the ${question.label.toLowerCase()} example and stop automatic rotation`} title={`Show the ${question.label.toLowerCase()} example and stop automatic rotation`} aria-pressed={active === index} aria-controls={`${id}-slide-${index}`} onClick={() => { setActive(index); setPaused(true) }}><span className="portfolio-carousel-dot" />{active === index && running && <span className="portfolio-slide-progress" key={`${active}-progress`} aria-hidden="true" />}</button>)}
      </div>
    </div>
  )
}
