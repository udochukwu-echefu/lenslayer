import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { Pressable, View } from "react-native";
import { NotificationRow } from "@/components/notification-row";
import { AppText, EmptyState, ErrorState, FormError, Loading, Screen, Section } from "@/components/ui";
import { api } from "@/lib/api";
import { useNotifications } from "@/lib/queries";
import { useWorkspace } from "@/lib/workspace";

/** Review results, mentions and date reminders. Unread first; opening one marks it read. */
export default function NotificationsScreen() {
  const { organizationId } = useWorkspace();
  const queryClient = useQueryClient();
  const query = useNotifications(organizationId);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["notifications", organizationId] });
  const readOne = useMutation({ mutationFn: (id: string) => api.markNotificationRead(organizationId, id), onSuccess: refresh });
  const readAll = useMutation({ mutationFn: () => api.markAllNotificationsRead(organizationId), onSuccess: refresh });
  const items = query.data ?? [];
  const fresh = items.filter((item) => !item.read_at);
  const earlier = items.filter((item) => item.read_at);

  return (
    <Screen onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Stack.Screen options={{
        headerRight: fresh.length ? () => (
          <Pressable accessibilityRole="button" hitSlop={10} disabled={readAll.isPending} onPress={() => readAll.mutate()}>
            <AppText variant="smallStrong" tone="accent">Mark all read</AppText>
          </Pressable>
        ) : undefined,
      }} />
      <FormError error={readAll.error ?? readOne.error} />
      {query.isLoading ? <Loading rows={5} /> : query.error ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : !items.length ? (
        <EmptyState title="You’re all caught up" message="Review results, mentions and date reminders will appear here."
          action={{ label: "Choose what you’re notified about", onPress: () => router.push("/settings/notifications") }} />
      ) : (
        <>
          {fresh.length ? (
            <Section title="New">
              <View>{fresh.map((notification, index) => <NotificationRow key={notification.id} notification={notification} last={index === fresh.length - 1} onOpen={() => readOne.mutate(notification.id)} />)}</View>
            </Section>
          ) : null}
          {earlier.length ? (
            <Section title="Earlier">
              <View>{earlier.map((notification, index) => <NotificationRow key={notification.id} notification={notification} last={index === earlier.length - 1} />)}</View>
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  );
}
