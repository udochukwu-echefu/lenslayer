import { AlertTriangle, FilePlus2, Inbox } from "lucide-react";
import Link from "next/link";

export function PageLoading({ rows = 5 }: { rows?: number }) {
  return <div className="panel" aria-label="Loading"><div className="loading-stack">{Array.from({ length: rows }, (_, index) => <div className="loading-row" key={index}><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /></div>)}</div></div>;
}

export function PageError({ error }: { error: Error }) {
  return <div className="empty panel"><div><span className="empty-icon"><AlertTriangle size={20} /></span><h2>We couldn’t load this view.</h2><p>{error.message || "Check the API connection and try again."}</p><button className="button secondary" onClick={() => window.location.reload()}>Try again</button></div></div>;
}

export function EmptyContracts({ compact = false, canCreate = true }: { compact?: boolean; canCreate?: boolean }) {
  return <div className={`empty ${compact ? "compact" : "panel"}`}><div><span className="empty-icon">{compact ? <Inbox size={20} /> : <FilePlus2 size={20} />}</span><h2>{compact ? "Nothing needs attention" : "No contracts yet"}</h2><p>{compact ? "Processing issues and completed reviews that need a decision will appear here." : canCreate ? "Upload your first agreement to create an evidence-linked review, risk list, and action record." : "This public workspace is ready to explore. Contract uploads will return with private accounts."}</p>{!compact && canCreate && <Link href="/contracts/new" className="button">Review a contract</Link>}</div></div>;
}
