import { router, Stack, useLocalSearchParams, useNavigation } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { HeaderButton } from "@/components/header";
import { AppText, EmptyState, ErrorState, ListRow, Loading, PageIntro, Screen, Section, Segmented } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { useContractVersions } from "@/lib/queries";
import type { ContractVersion } from "@/lib/shared/types";
import { useWorkspace } from "@/lib/workspace";
import { createStyles } from "@/theme/create-styles";
import { radius, space } from "@/theme/tokens";

type ViewMode = "changes" | "notes" | "versions";

/** Shows the evidence returned for a revision alongside its notes and history. */
export default function VersionsScreen() {
  const { id, versionId } = useLocalSearchParams<{ id: string; versionId?: string }>();
  const navigation = useNavigation();
  const { organizationId, canUpload } = useWorkspace();
  const query = useContractVersions(organizationId, id);
  const [mode, setMode] = useState<ViewMode>("changes");
  const versions = [...(query.data ?? [])].sort((a, b) => b.version_number - a.version_number);
  const version = versionId ? versions.find((item) => item.id === versionId) : versions[0];
  const previous = versions.find((item) => item.id === version?.comparison.compared_to_version_id);

  return (
    <Screen onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Stack.Screen options={{
        headerLeft: navigation.canGoBack() ? undefined : () => (
          <HeaderButton icon="chevronLeft" label="Back to negotiation" onPress={() => router.replace({ pathname: "/contract/[id]", params: { id, tab: "negotiate" } })} />
        ),
        headerRight: canUpload ? () => (
        <HeaderButton icon="upload" label="Upload revision" onPress={() => router.push({ pathname: "/new/version", params: { contractId: id } })} />
        ) : undefined,
      }} />
      {query.isLoading ? <Loading rows={4} /> : query.error ? <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        : !versions.length ? <EmptyState icon="layers" title="No versions yet" message="Revisions appear here when they’re uploaded." />
        : (
          <>
            <PageIntro title={previous && version ? `v${previous.version_number} to v${version.version_number}` : version ? `Version ${version.version_number}` : "Version history"}
              description={version ? versionDetails(version) : undefined} />
            <Segmented label="Version view" value={mode} onChange={setMode} options={[
              { value: "changes", label: "Changes" }, { value: "notes", label: "Notes" }, { value: "versions", label: `All versions ${versions.length}` },
            ]} />
            {mode === "versions" ? (
              <View>
                {versions.map((item, index) => (
                  <ListRow key={item.id} icon="layers" title={`Version ${item.version_number}${item.label ? ` · ${item.label}` : ""}`}
                    subtitle={versionDetails(item)} value={version?.id === item.id ? "Selected" : undefined}
                    onPress={() => { router.setParams({ versionId: item.id }); setMode("changes"); }} last={index === versions.length - 1} />
                ))}
              </View>
            ) : !version ? <EmptyState title="Version unavailable" message="Choose another revision from the version history." />
              : mode === "notes" ? (
                <Section title={`Version ${version.version_number} notes`}>
                  <AppText tone={version.notes ? "ink" : "muted"}>{version.notes || "No notes were added for this version."}</AppText>
                  {version.source_name ? <AppText variant="small" tone="muted">{version.source_name}</AppText> : null}
                </Section>
              ) : <VersionChanges version={version} />}
          </>
        )}
    </Screen>
  );
}

function versionDetails(version: ContractVersion) {
  const { comparison } = version;
  const date = formatDate(version.created_at, { day: "numeric", month: "short", year: "numeric" });
  const counts = comparison.compared_to_version_id ? ` · ${comparison.added_count} added, ${comparison.removed_count} removed` : "";
  return `Received ${date}${version.uploaded_by_name ? ` from ${version.uploaded_by_name}` : ""}${counts}`;
}

function VersionChanges({ version }: { version: ContractVersion }) {
  const styles = useStyles();
  const { compared_to_version_id, added, removed, added_count, removed_count, changed_summary } = version.comparison;
  if (!compared_to_version_id) return <EmptyState icon="layers" title="Original version" message="There is no earlier version to compare." />;

  return (
    <View style={styles.stack}>
      {changed_summary ? <AppText variant="small" tone="muted">{changed_summary}</AppText> : null}
      {removed_count ? (
        <Section title={`Removed · ${removed_count}`}>
          {removed.map((line, i) => (
            <View key={i} style={[styles.line, styles.removed]}>
              <AppText tone="danger" accessibilityLabel="Removed">−</AppText>
              <AppText style={styles.struck}>{line}</AppText>
            </View>
          ))}
          {removed.length < removed_count ? <AppText variant="small" tone="muted">Showing {removed.length} of {removed_count} removed lines.</AppText> : null}
        </Section>
      ) : null}
      {added_count ? (
        <Section title={`Added · ${added_count}`}>
          {added.map((line, i) => (
            <View key={i} style={[styles.line, styles.added]}>
              <AppText tone="good" accessibilityLabel="Added">+</AppText>
              <AppText style={styles.content}>{line}</AppText>
            </View>
          ))}
          {added.length < added_count ? <AppText variant="small" tone="muted">Showing {added.length} of {added_count} added lines.</AppText> : null}
        </Section>
      ) : null}
      {!added_count && !removed_count ? <EmptyState icon="layers" title="No changed lines" message="The comparison did not find any added or removed text." /> : null}
    </View>
  );
}

const useStyles = createStyles((c) => ({
  stack: { gap: space.lg },
  line: { flexDirection: "row", gap: space.sm, padding: space.md, borderRadius: radius.md },
  removed: { backgroundColor: c.dangerSoft },
  added: { backgroundColor: c.goodSoft },
  struck: { flex: 1, textDecorationLine: "line-through" },
  content: { flex: 1 },
}));
