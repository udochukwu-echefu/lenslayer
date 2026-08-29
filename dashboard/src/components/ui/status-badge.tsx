import { AlertTriangle, CheckCircle2, CircleHelp, Clock3, LoaderCircle, XCircle } from "lucide-react";
import { titleCase } from "@/lib/utils";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const statusConfig: Record<string, { tone: Tone; icon: typeof CheckCircle2; label?: string }> = {
  ready: { tone: "info", icon: CheckCircle2, label: "Ready for decision" },
  reviewed: { tone: "success", icon: CheckCircle2 },
  completed: { tone: "success", icon: CheckCircle2 },
  done: { tone: "success", icon: CheckCircle2 },
  approved: { tone: "success", icon: CheckCircle2 },
  processing: { tone: "warning", icon: LoaderCircle },
  running: { tone: "warning", icon: LoaderCircle },
  queued: { tone: "neutral", icon: Clock3 },
  pending: { tone: "warning", icon: Clock3 },
  failed: { tone: "danger", icon: XCircle },
  rejected: { tone: "danger", icon: XCircle },
  blocked: { tone: "danger", icon: AlertTriangle },
  escalated: { tone: "danger", icon: AlertTriangle },
  open: { tone: "info", icon: Clock3 },
  in_progress: { tone: "warning", icon: LoaderCircle, label: "In progress" },
};

export function StatusBadge({ status, label, className = "" }: { status: string; label?: string; className?: string }) {
  const config = statusConfig[status.toLowerCase()] ?? { tone: "neutral" as Tone, icon: CircleHelp };
  const Icon = config.icon;
  return <span className={`status-badge ${config.tone} ${className}`.trim()}><Icon aria-hidden="true" size={14} /><span>{label ?? config.label ?? titleCase(status)}</span></span>;
}
