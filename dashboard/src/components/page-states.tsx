import { AlertTriangle } from "lucide-react";
import Link from "next/link";

export function PageLoading({ rows = 5 }: { rows?: number }) {
  return <div className="panel" aria-label="Loading"><div className="loading-stack">{Array.from({ length: rows }, (_, index) => <div className="loading-row" key={index}><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /></div>)}</div></div>;
}

export function PageError({ error }: { error: Error }) {
  return <div className="inline-state error-state" role="alert"><AlertTriangle size={18} /><div><h2>This view could not load</h2><p>{error.message || "Check the connection and try again."}</p><button className="button secondary" onClick={() => window.location.reload()}>Try again</button></div></div>;
}

export function EmptyContracts({ compact = false, canCreate = true, message }: { compact?: boolean; canCreate?: boolean; message?: string }) {
  return <div className={`inline-state ${compact ? "compact" : ""}`}><div><h2>{compact ? (message ?? "No reviews need your attention.") : "No contracts in this workspace."}</h2>{!compact && <p>{canCreate ? "Upload a contract to create an evidence-linked review." : "Select an authorised workspace to inspect contract records."}</p>}{!compact && canCreate && <Link href="/contracts/new" className="button">Upload a contract</Link>}</div></div>;
}
