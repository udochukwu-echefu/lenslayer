import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { EmptyState, ErrorState, ListRow, Loading, Screen, SearchField, Section } from "@/components/ui";
import { api } from "@/lib/api";
import { routeForWebPath } from "@/lib/links";
import { useDebouncedValue } from "@/lib/queries";
import { useWorkspace } from "@/lib/workspace";

/**
 * Workspace search: agreements and actions by name. It does not read inside
 * documents, so every result set ends with a hand-off to Ask, which does.
 */
export default function SearchScreen() {
  const { organizationId } = useWorkspace();
  const [text, setText] = useState("");
  const q = useDebouncedValue(text.trim());
  const query = useQuery({
    queryKey: ["workspace-search", organizationId, q],
    queryFn: ({ signal }) => api.searchWorkspace(organizationId, q, { signal }),
    enabled: Boolean(organizationId) && q.length >= 2,
  });
  const items = query.data?.items ?? [];
  const contracts = items.filter((item) => item.kind === "contract");
  const tasks = items.filter((item) => item.kind === "task");

  return (
    <Screen contentStyle={{ gap: 20 }}>
      <SearchField label="Search the workspace" value={text} onChangeText={setText} placeholder="Agreements and actions" />
      {q.length < 2 ? (
        <EmptyState icon="search" message="Search agreements by title, counterparty or type, and actions by name." />
      ) : query.isLoading ? <Loading rows={4} /> : query.error ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : (
        <>
          {contracts.length ? (
            <Section title={`Agreements · ${contracts.length}`}>
              <View>{contracts.map((item, index) => <ListRow key={item.id} icon="document" title={item.title} subtitle={item.meta} onPress={() => router.push(routeForWebPath(item.href))} last={index === contracts.length - 1} />)}</View>
            </Section>
          ) : null}
          {tasks.length ? (
            <Section title={`Actions · ${tasks.length}`}>
              <View>{tasks.map((item, index) => <ListRow key={item.id} icon="circle" title={item.title} subtitle={item.meta} onPress={() => router.push(routeForWebPath(item.href))} last={index === tasks.length - 1} />)}</View>
            </Section>
          ) : null}
          {!items.length ? <EmptyState icon="search" title={`Nothing named “${q}”`} message="Search covers names, not the text inside agreements." /> : null}
          <ListRow icon="ask" title={`Ask a question about “${q}”`} subtitle="Searches inside every agreement" onPress={() => router.push("/ask")} last />
        </>
      )}
    </Screen>
  );
}
