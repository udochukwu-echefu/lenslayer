import { useState } from "react";
import { formatDate, reminderLabel } from "@/lib/format";
import { flatten, useLifecycleList } from "@/lib/queries";
import type { LifecycleItem } from "@/lib/shared/types";
import { useWorkspace } from "@/lib/workspace";
import { LoadMore } from "./load-more";
import { AppText, EmptyState, ErrorState, ListRow, Loading, Section } from "./ui";

/** Shows the configured reminder lead time for each upcoming active date. */
export function UpcomingReminders({ onOpen }: { onOpen: (item: LifecycleItem) => void }) {
  const { organizationId } = useWorkspace();
  const [today] = useState(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date.toISOString();
  });
  const query = useLifecycleList(organizationId, { status: "active", due_after: today, sort: "due_at", descending: false });
  const { items, total } = flatten(query.data);
  return (
    <>
      <AppText variant="small" tone="muted">{"When each upcoming date will remind its owner. Times use your phone's time zone."}</AppText>
      <Section title="Upcoming dates">
        {query.isLoading ? <Loading rows={4} /> : query.error ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : items.length ? (
          <>
            {items.map((item, index) => (
              <ListRow key={item.id} icon="bell" title={item.title} onPress={() => onOpen(item)}
                subtitle={item.last_notified_at ? `Last reminded ${formatDate(item.last_notified_at)}` : `Reminder ${reminderLabel(item.reminder_days).toLowerCase()}`}
                value={formatDate(item.due_at, { day: "numeric", month: "short" })} last={index === items.length - 1} />
            ))}
            <LoadMore shown={items.length} total={total} noun="dates" hasNextPage={query.hasNextPage} isFetchingNextPage={query.isFetchingNextPage} fetchNextPage={query.fetchNextPage} />
          </>
        ) : <EmptyState icon="bell" message="Reminders for upcoming renewal and notice dates appear here." />}
      </Section>
    </>
  );
}
