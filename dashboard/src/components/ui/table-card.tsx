import type { ReactNode } from "react";

export function TableCard({ title, description, actions, children, className = "" }: { title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`table-card ${className}`.trim()}>
    <header className="table-card-header"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{actions && <div className="table-card-actions">{actions}</div>}</header>
    {children}
  </section>;
}
