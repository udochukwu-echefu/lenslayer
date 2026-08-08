"use client";
import { AlertTriangle } from "lucide-react";
export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) { return <div className="page"><div className="empty panel"><div><span className="empty-icon"><AlertTriangle size={20} /></span><h2>This view hit an unexpected error.</h2><p>{error.message}</p><button className="button secondary" onClick={reset}>Try again</button></div></div></div>; }
