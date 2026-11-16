import { router, Stack } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { ContractList } from "@/components/contract-row";
import { HeaderButton } from "@/components/header";
import { LoadMore } from "@/components/load-more";
import { Button, Chips, EmptyState, ErrorState, Loading, OptionSheet, Screen, SearchField } from "@/components/ui";
import type { ContractFilters } from "@/lib/api/query-types";
import { flatten, useContractList, useDebouncedValue, useOverview } from "@/lib/queries";
import { useWorkspace } from "@/lib/workspace";

type Status = "all" | "ready" | "reviewed" | "processing" | "failed";
type Sort = NonNullable<ContractFilters["sort"]>;
const sortOptions: { value: Sort; label: string }[] = [
  { value: "updated_at", label: "Last updated" }, { value: "created_at", label: "Date added" }, { value: "title", label: "Title A to Z" }, { value: "counterparty", label: "Counterparty" },
];

/** The contract register: search, filter by review state, sort, and page through. */
export default function AgreementsScreen() {
  const { organizationId, canUpload } = useWorkspace();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [sort, setSort] = useState<Sort>("updated_at");
  const [sortOpen, setSortOpen] = useState(false);
  const q = useDebouncedValue(search.trim());
  const overview = useOverview(organizationId);
  const counts = overview.data?.counts;
  const query = useContractList(organizationId, {
    q: q || undefined,
    status: status === "all" ? undefined : status === "processing" ? "queued,processing,running" : status,
    sort,
    // Names read A to Z; dates read newest first.
    descending: sort === "updated_at" || sort === "created_at",
  }, true);
  const { items, total } = flatten(query.data);
  const filtered = Boolean(q) || status !== "all";

  return (
    <Screen onRefresh={() => void query.refetch()} refreshing={query.isRefetching} contentStyle={{ gap: 16 }}>
      <Stack.Screen options={{
        headerRight: () => (
          <View style={{ flexDirection: "row" }}>
            <HeaderButton icon="sort" label="Sort agreements" onPress={() => setSortOpen(true)} />
            {canUpload ? <HeaderButton icon="plus" label="Upload a contract" onPress={() => router.push("/new/contract")} /> : null}
          </View>
        ),
      }} />
      <SearchField label="Search agreements" value={search} onChangeText={setSearch} placeholder="Title, counterparty or type" />
      <Chips label="Filter by review state" value={status} onChange={setStatus} options={[
        { value: "all", label: "All", count: counts?.contracts },
        { value: "ready", label: "Ready", count: counts?.ready },
        { value: "reviewed", label: "Reviewed" },
        { value: "processing", label: "Reviewing", count: counts?.processing || undefined },
        { value: "failed", label: "Failed", count: counts?.failed || undefined },
      ]} />
      <OptionSheet title="Sort by" visible={sortOpen} value={sort} options={sortOptions} onClose={() => setSortOpen(false)} onSelect={(value) => { setSortOpen(false); setSort(value); }} />

      {query.isLoading ? <Loading rows={6} /> : query.error ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : items.length ? (
        <View>
          <ContractList contracts={items} />
          <LoadMore shown={items.length} total={total} noun="agreements" hasNextPage={query.hasNextPage} isFetchingNextPage={query.isFetchingNextPage} fetchNextPage={query.fetchNextPage} />
        </View>
      ) : filtered ? (
        <View>
          <EmptyState icon="search" title="No agreements match" message="Search covers titles, counterparties and contract types. To search inside agreements, ask a question instead." />
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 8 }}>
            <Button label="Clear filters" variant="secondary" compact onPress={() => { setSearch(""); setStatus("all"); }} />
            <Button label="Ask instead" compact onPress={() => router.push("/ask")} />
          </View>
        </View>
      ) : (
        <EmptyState icon="document" title="No agreements yet" message="Upload a contract to get a source-linked first-pass review."
          action={canUpload ? { label: "Upload a contract", onPress: () => router.push("/new/contract") } : undefined} />
      )}
    </Screen>
  );
}
