"use client";

import { ApiError } from "@/lib/api";

export function AgentViewError({ error, retry, resource = "api" }: { error: Error; retry: () => void; resource?: "api" | "run" | "evidence" }) {
  const denied = error instanceof ApiError && [401, 403].includes(error.status);
  const missing = error instanceof ApiError && error.status === 404;
  const unavailable = {
    api: { title: "Agent API unavailable", message: "This backend does not expose the agent API yet. No execution data has been substituted." },
    run: { title: "Run unavailable", message: "This run does not exist in the selected workspace, or you no longer have access." },
    evidence: { title: "Evidence unavailable", message: "This evidence receipt is unavailable in the selected run or workspace. No source excerpt is shown." },
  }[resource];
  const title = denied ? "Access restricted" : missing ? unavailable.title : "This view could not load";
  const message = denied ? "Your workspace session or role does not allow this request. Sign in or ask an owner to check your access." : missing ? unavailable.message : error.message;
  return <div className="inline-state error-state" role="alert"><div><h2>{title}</h2><p>{message}</p><button type="button" className="button secondary" onClick={retry}>Try again</button></div></div>;
}

export function AgentDemoNotice() {
  return <p className="agent-notice"><strong>Synthetic execution example.</strong> These records illustrate the protocol only. No agent ran, no approval was granted, and no task was created.</p>;
}
