import { useState } from "react";
import { formatDate } from "@/lib/format";
import { flatten, useLifecycleList } from "@/lib/queries";
import type { LifecycleItem } from "@/lib/shared/types";
import { useWorkspace } from "@/lib/workspace";
import { LoadMore } from "./load-more";
import { EmptyState, ErrorState, ListRow, Loading, PageIntro, Section } from "./ui";

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
      <PageIntro title="Reminders" description="See when reminders are set for your workspace’s upcoming dates. Dates use your device’s time zone." />
      <Section title="Upcoming dates">
        {query.isLoading ? <Loading rows={4} /> : query.error ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : items.length ? (
          <>
            {items.map((item, index) => (
              <ListRow key={item.id} icon="bell" title={item.title} onPress={() => onOpen(item)}
                subtitle={item.last_notified_at ? `Last reminded ${formatDate(item.last_notified_at)}` : item.reminder_days === 0 ? "Reminder on the due date" : `Reminder ${item.reminder_days} ${item.reminder_days === 1 ? "day" : "days"} before`}
                value={formatDate(item.due_at, { day: "numeric", month: "short" })} last={index === items.length - 1} />
            ))}
            <LoadMore shown={items.length} total={total} noun="dates" hasNextPage={query.hasNextPage} isFetchingNextPage={query.isFetchingNextPage} fetchNextPage={query.fetchNextPage} />
          </>
        ) : <EmptyState icon="bell" message="Reminders for upcoming renewal and notice dates appear here." />}
      </Section>
    </>
  );
}
