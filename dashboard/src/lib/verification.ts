import type { VerificationAction, VerificationStatus } from "./types";

export function verificationTone(action: VerificationAction) {
  return action === "Reject" ? "high" : action === "Escalate" ? "medium" : "low";
}

export function verificationStatusLabel(status: VerificationStatus) {
  if (status === "pending") return "Awaiting review";
  return status.split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}
