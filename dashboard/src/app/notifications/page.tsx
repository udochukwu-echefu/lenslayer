"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NotificationRow } from "@/components/notification-row";
import { PageError, PageLoading } from "@/components/page-states";
import { useWorkspace } from "@/components/workspace-provider";
import { api } from "@/lib/api";

export default function NotificationsPage() {
  const { activeOrganization, isDemo } = useWorkspace();
  const organizationId = activeOrganization?.id ?? "";
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["notifications", organizationId], queryFn: () => api.notifications(organizationId), enabled: Boolean(organizationId) });
  const notifications = query.data ?? [];
  const unreadCount = notifications.filter((notification) => !notification.read_at).length;
  const readMutation = useMutation({
    mutationFn: (notificationId: string) => api.markNotificationRead(organizationId, notificationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", organizationId] }),
  });
  const readAllMutation = useMutation({
    mutationFn: () => api.markAllNotificationsRead(organizationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", organizationId] }),
  });

  return <div className="page notifications-page">
    <div className="page-heading"><div><h1 className="page-title">Notifications</h1><p className="page-description">Review updates, deadlines, and processing alerts across the workspace.</p></div>{unreadCount > 0 && !isDemo && <button className="button secondary" disabled={readAllMutation.isPending} onClick={() => readAllMutation.mutate()}>{readAllMutation.isPending ? "Marking read..." : "Mark all read"}</button>}</div>
    {query.isLoading ? <PageLoading rows={5} /> : query.error ? <PageError error={query.error} /> : notifications.length ? <div className="notifications-page-list">{notifications.map((notification) => <NotificationRow key={notification.id} notification={notification} onOpen={() => { if (!notification.read_at && !isDemo) readMutation.mutate(notification.id); }} />)}</div> : <div className="inline-state"><div><strong>You&apos;re caught up</strong><p>Processing updates and review alerts will appear here.</p></div></div>}
  </div>;
}
