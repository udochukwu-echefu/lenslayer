import { useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { Moon, Sun } from "lucide-react"

function clearReveal() {
  const root = document.documentElement
  delete root.dataset.themeReveal
  delete root.dataset.themeRevealSoft
  root.style.removeProperty("--theme-reveal-center")
  root.style.removeProperty("--theme-reveal-start")
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme === "dark" ? "dark" : "light")
  const busy = useRef(false)
  const transition = useRef(null)
  const reveal = useRef(null)

  useEffect(() => () => {
    transition.current?.skipTransition()
    reveal.current?.cancel()
    clearReveal()
  }, [])

  function applyTheme(nextTheme) {
    document.documentElement.dataset.theme = nextTheme
    document.querySelector('meta[name="theme-color"]').content = nextTheme === "dark" ? "#191a17" : "#ffffff"
    flushSync(() => setTheme(nextTheme))
    try {
      localStorage.setItem("lenslayer-landing-theme", nextTheme)
    } catch { /* The toggle still works when storage is unavailable. */ }
  }

  async function toggleTheme(event) {
    if (busy.current) return
    const root = document.documentElement
    const nextTheme = root.dataset.theme === "dark" ? "light" : "dark"
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (event.detail === 0 || reduceMotion || !document.startViewTransition || !root.animate) {
      applyTheme(nextTheme)
      return
    }

    busy.current = true
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = bounds.left + bounds.width / 2
    const y = bounds.top + bounds.height / 2
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
    const center = `${x / innerWidth * 100}% ${y / innerHeight * 100}%`
    const coverage = radius / (Math.hypot(innerWidth, innerHeight) / Math.SQRT2) * 100
    const from = `circle(0% at ${center})`
    const to = `circle(${coverage}% at ${center})`
    const softReveal = typeof CSS.registerProperty === "function" && CSS.supports("mask-image", "radial-gradient(circle at center, black 50%, transparent 51%)")
    root.dataset.themeReveal = "active"
    root.style.setProperty("--theme-reveal-start", from)
    if (softReveal) {
      root.dataset.themeRevealSoft = "active"
      root.style.setProperty("--theme-reveal-center", center)
    }

    try {
      transition.current = document.startViewTransition(() => applyTheme(nextTheme))
      await transition.current.ready
      reveal.current = root.animate(
        softReveal ? { "--theme-reveal-progress": ["0%", "102%"] } : { clipPath: [from, to] },
        { duration: 520, easing: "ease-in-out", fill: "forwards", pseudoElement: "::view-transition-new(root)" },
      )
      await reveal.current.finished
      await transition.current.finished
    } catch {
      transition.current?.skipTransition()
      if (root.dataset.theme !== nextTheme) applyTheme(nextTheme)
    } finally {
      reveal.current?.cancel()
      reveal.current = null
      transition.current = null
      clearReveal()
      busy.current = false
    }
  }

  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
  return <button type="button" className="theme-toggle" aria-label={label} title={label} onClick={toggleTheme}><span className="theme-toggle-symbol" aria-hidden="true"><Sun className="theme-toggle-sun" /><Moon className="theme-toggle-moon" /></span></button>
}
