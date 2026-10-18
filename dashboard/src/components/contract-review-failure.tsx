import { AlertTriangle } from "lucide-react";
import type { Job } from "@/lib/types";
import { reviewJobMessage, reviewJobReference } from "@/lib/review-job-display";

export function ContractReviewFailure({ job }: { job: Job | null | undefined }) {
  const reference = reviewJobReference(job?.id);
  return <div className="error-banner" role="alert">
    <AlertTriangle size={20} aria-hidden="true" />
    <div>
      <strong>The review could not finish</strong>
      <p>{reviewJobMessage(job)}</p>
      {reference && <p>Support reference: <code style={{ overflowWrap: "anywhere" }}>{reference}</code></p>}
    </div>
  </div>;
}
