import { useEffect, useRef } from "react"

// Crisp content handoff for interactive previews; restrained enough to preserve context.
export function usePanelMotion(value) {
  const ref = useRef(null)
  const previous = useRef(value)
  useEffect(() => {
    if (previous.current === value) return
    previous.current = value
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.activeElement?.matches(":focus-visible")) return
    const animation = ref.current?.animate(
      [
        { opacity: 0.25, transform: "translate3d(0,8px,0) scale(.995)", filter: "blur(2px)" },
        { opacity: 1, transform: "translate3d(0,0,0) scale(1)", filter: "blur(0)" },
      ],
      { duration: 280, easing: "cubic-bezier(.16,1,.3,1)" },
    )
    return () => animation?.cancel()
  }, [value])
  return ref
}
