import { AlertTriangle, CheckCircle2, Clock3, FileCheck2 } from "lucide-react";
import Link from "next/link";
import type { Notification } from "@/lib/types";
import { formatRelativeDate } from "@/lib/utils";

function NotificationIcon({ kind }: { kind: string }) {
  if (kind.includes("failed") || kind.includes("overdue")) return <AlertTriangle aria-hidden="true" size={17} />;
  if (kind.includes("ready") || kind.includes("completed")) return <CheckCircle2 aria-hidden="true" size={17} />;
  if (kind.includes("contract")) return <FileCheck2 aria-hidden="true" size={17} />;
  return <Clock3 aria-hidden="true" size={17} />;
}

export function NotificationRow({ notification }: { notification: Notification }) {
  return <Link className="notification-row" href={notification.action_url || "/inbox"}><span className={`notification-icon ${notification.read_at ? "" : "unread"}`}><NotificationIcon kind={notification.kind} /></span><span><strong>{notification.title}</strong><small>{notification.message}</small><time dateTime={notification.created_at}>{formatRelativeDate(notification.created_at)}{!notification.read_at && <span className="sr-only">, unread</span>}</time></span></Link>;
}
