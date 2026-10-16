import Link from "next/link";
import type { ReactNode } from "react";

export function AgentsHubHeader({ section, actions }: { section: "credentials" | "runs"; actions?: ReactNode }) {
  return <header className="agents-hub-header">
    <div className="page-heading">
      <div><h1 className="page-title">Agents</h1><p className="page-description">Manage scoped access and inspect what each run proposed, authorized and verified.</p></div>
      {actions && <div className="agent-controls">{actions}</div>}
    </div>
    <nav className="agents-section-links" aria-label="Agents sections">
      <Link href="/agents" aria-current={section === "credentials" ? "page" : undefined}>Credentials</Link>
      <Link href="/agents/runs" aria-current={section === "runs" ? "page" : undefined}>Runs</Link>
    </nav>
  </header>;
}
