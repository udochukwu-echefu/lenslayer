import { useQuery } from "@tanstack/react-query";
import { router, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { AppText, EmptyState, ErrorState, ListRow, Loading, Screen, SearchField, Section } from "@/components/ui";
import { api } from "@/lib/api";
import { routeForWebPath } from "@/lib/links";
import { useDebouncedValue } from "@/lib/queries";
import { useRecentSearches } from "@/lib/recent-searches";
import { useWorkspace } from "@/lib/workspace";
import { createStyles } from "@/theme/create-styles";
import { radius, space } from "@/theme/tokens";

/**
 * Workspace search: agreements and actions by name. It does not read inside
 * documents, so every result set ends with a hand-off to Ask, which does.
 * Before you type, the last few searches in this workspace sit under the box.
 */
export default function SearchScreen() {
  const styles = useStyles();
  const { organizationId } = useWorkspace();
  const recent = useRecentSearches(organizationId);
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
  // Keep a search once it has been used, so half-typed words never pile up.
  const go = (href: Href) => { recent.remember(q); router.push(href); };

  return (
    <Screen contentStyle={{ gap: 20 }} keyboardShouldPersistTaps="handled">
      <SearchField label="Search the workspace" value={text} onChangeText={setText} placeholder="Agreements and actions" autoFocus onSubmit={() => recent.remember(text)} />
      {q.length < 2 ? (
        recent.items.length ? (
          <Section title="Recent" action={{ label: "Clear", onPress: recent.clear }}>
            <View style={styles.chips}>
              {recent.items.map((term) => (
                <Pressable key={term} accessibilityRole="button" accessibilityLabel={`Search for ${term}`} onPress={() => setText(term)} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
                  <AppText variant="small">{term}</AppText>
                </Pressable>
              ))}
            </View>
          </Section>
        ) : <EmptyState icon="search" message="Search agreements by title, counterparty or type, and actions by name." />
      ) : query.isLoading ? <Loading rows={4} /> : query.error ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : (
        <>
          {contracts.length ? (
            <Section title={`Agreements · ${contracts.length}`}>
              <View>{contracts.map((item, index) => <ListRow key={item.id} icon="document" title={item.title} subtitle={item.meta} onPress={() => go(routeForWebPath(item.href))} last={index === contracts.length - 1} />)}</View>
            </Section>
          ) : null}
          {tasks.length ? (
            <Section title={`Actions · ${tasks.length}`}>
              <View>{tasks.map((item, index) => <ListRow key={item.id} icon="circle" title={item.title} subtitle={item.meta} onPress={() => go(routeForWebPath(item.href))} last={index === tasks.length - 1} />)}</View>
            </Section>
          ) : null}
          {!items.length ? <EmptyState icon="search" title={`Nothing named “${q}”`} message="Search covers names, not the text inside agreements." /> : null}
          <ListRow icon="ask" title={`Ask a question about “${q}”`} subtitle="Searches inside every agreement" onPress={() => go("/ask")} last />
        </>
      )}
    </Screen>
  );
}

const useStyles = createStyles((c) => ({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: c.raised, justifyContent: "center" },
  pressed: { opacity: 0.6 },
}));
