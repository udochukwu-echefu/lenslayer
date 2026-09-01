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

function notificationTone(kind: string) {
  if (kind.includes("failed") || kind.includes("overdue")) return "danger";
  if (kind.includes("ready") || kind.includes("contract")) return "info";
  if (kind.includes("completed")) return "success";
  return "warning";
}

export function NotificationRow({ notification, onOpen }: { notification: Notification; onOpen?: () => void }) {
  return <Link className="notification-row" href={notification.action_url || "/inbox"} onClick={onOpen}><span className={`notification-icon ${notificationTone(notification.kind)}`}><NotificationIcon kind={notification.kind} /></span><span className="notification-copy"><span className="notification-title-line"><strong>{notification.title}</strong><time dateTime={notification.created_at}>{formatRelativeDate(notification.created_at)}{!notification.read_at && <span className="sr-only">, unread</span>}</time></span><small>{notification.message}</small></span></Link>;
}
