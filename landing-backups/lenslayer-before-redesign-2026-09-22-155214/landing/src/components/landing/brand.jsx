export function LensMark({ className = "" }) {
  return <img className={`lens-mark${className ? ` ${className}` : ""}`} src="/lenslayer-mark.svg" alt="" aria-hidden="true" />
}

export function Brand() {
  return <a className="brand" href="#top" aria-label="LensLayer home"><img src="/lenslayer-lockup.svg" alt="" /></a>
}
