// Adapted from Shadcn Space Hero 02: 2523:10520 / 2683:3326.
export function RoundLink({ href, children, compact = false, light = false }) {
  return <a href={href} className={`round-link${compact ? " round-link-compact" : ""}${light ? " round-link-light" : ""}`}>
    <span>{children}</span><span className="round-link-icon" aria-hidden="true"><img src="/references/shadcn-arrow-up-right.svg" width="16" height="16" alt="" /></span>
  </a>
}
