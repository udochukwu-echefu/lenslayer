import { useQuery } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ContractActions } from "@/components/contract/actions";
import { ContractActivity } from "@/components/contract/activity";
import { ContractDecisions } from "@/components/contract/decisions";
import { ContractDiscussion } from "@/components/contract/discussion";
import { Finding, RecordCards } from "@/components/contract/findings";
import { ContractLifecycle } from "@/components/contract/lifecycle";
import { ContractNegotiate } from "@/components/contract/negotiate";
import { DealPassport } from "@/components/contract/passport";
import { QuestionPanel } from "@/components/contract/question-panel";
import { ShareSheet } from "@/components/contract/share-sheet";
import { HeaderButton } from "@/components/header";
import { AppText, Button, Chips, EmptyState, ErrorState, ListRow, Loading, Notice, Section, Segmented, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { asText, reviewJobMessage, reviewJobProgress, reviewJobReference, severity } from "@/lib/format";
import type { Contract, Review } from "@/lib/shared/types";
import { useWorkspace } from "@/lib/workspace";
import { createStyles } from "@/theme/create-styles";
import { font, gutter, space } from "@/theme/tokens";

type Tab = "overview" | "passport" | "risks" | "obligations" | "ask" | "negotiate" | "discussion" | "decisions" | "actions" | "lifecycle" | "activity";
const tabs: Tab[] = ["overview", "passport", "risks", "obligations", "ask", "negotiate", "discussion", "decisions", "actions", "lifecycle", "activity"];
const MOVING = ["queued", "processing", "running"];
const suggestions = ["What notice do we need to give to stop the renewal?", "What happens if we miss a payment?", "Can we end it early?"];
const list = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.map((item) => (typeof item === "string" ? { title: item } : (item as Record<string, unknown>))) : []);

/**
 * One agreement and everything decided about it. The chips switch between
 * views of the same review; `?tab=` in a link opens a specific one. While the
 * review is still running, or if it failed, the screen shows that instead.
 */
export default function ContractScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; tab?: string }>();
  const contractId = params.id;
  const { organizationId, canUpload } = useWorkspace();
  const [tab, setTab] = useState<Tab>(tabs.includes(params.tab as Tab) ? (params.tab as Tab) : "overview");
  const [sharing, setSharing] = useState(false);

  const contract = useQuery({
    queryKey: ["contracts", organizationId, "detail", contractId],
    queryFn: () => api.contract(organizationId, contractId),
    enabled: Boolean(organizationId && contractId),
    refetchInterval: (query) => (query.state.data && MOVING.includes(query.state.data.status) ? 4000 : false),
  });
  const hasReview = contract.data ? ["ready", "reviewed", "completed"].includes(contract.data.status) : false;
  const review = useQuery({ queryKey: ["review", organizationId, contractId], queryFn: () => api.review(organizationId, contractId), enabled: Boolean(organizationId && contractId) && hasReview });

  if (contract.isLoading) return <View style={styles.pad}><Stack.Screen options={{ title: "" }} /><Loading rows={8} /></View>;
  if (contract.error || !contract.data) {
    return (
      <View style={styles.pad}>
        <Stack.Screen options={{ title: "" }} />
        <ErrorState error={contract.error ?? new Error("This contract isn’t available.")} onRetry={() => void contract.refetch()} />
        <Button label="Back to agreements" variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }
  const item = contract.data;
  const title = item.title || item.source_name;
  const risks = review.data?.analysis.risk_assessment ?? [];
  const showDock = hasReview && tab === "overview";

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex} keyboardVerticalOffset={90}>
      <Stack.Screen options={{
        title: "",
        headerBackTitle: "Agreements",
        headerRight: hasReview ? () => (
          <View style={{ flexDirection: "row" }}>
            <HeaderButton icon="ask" label="Ask this contract" onPress={() => setTab("ask")} />
            <HeaderButton icon="share" label="Share and export" onPress={() => setSharing(true)} />
          </View>
        ) : undefined,
      }} />
      <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: showDock ? 120 : insets.bottom + space.xxl }]} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
        <View style={styles.head}>
          <AppText style={styles.title} accessibilityRole="header">{title}</AppText>
          <View style={styles.meta}>
            <StatusBadge status={item.status} />
            {item.counterparty ? <AppText variant="small" tone="muted" numberOfLines={1} style={styles.flexShrink}>{item.counterparty}</AppText> : null}
          </View>
        </View>

        {MOVING.includes(item.status) ? <Processing contract={item} /> : item.status === "failed" ? <Failed contract={item} canUpload={canUpload} /> : (
          <>
            <Chips label="Contract sections" value={tab} onChange={setTab} options={[
              { value: "overview", label: "Overview" }, { value: "passport", label: "Passport" }, { value: "risks", label: "Risks", count: risks.length || undefined },
              { value: "obligations", label: "Obligations" }, { value: "ask", label: "Ask" }, { value: "negotiate", label: "Negotiate" }, { value: "discussion", label: "Discussion" },
              { value: "decisions", label: "Decisions" }, { value: "actions", label: "Actions" }, { value: "lifecycle", label: "Lifecycle" }, { value: "activity", label: "Activity" },
            ]} />
            {tab === "overview" ? <Overview review={review.data} loading={review.isLoading} error={review.error} onRetry={() => void review.refetch()} onOpenTab={setTab} /> : null}
            {tab === "passport" ? <DealPassport contractId={contractId} onOpenTab={(next) => setTab(next as Tab)} /> : null}
            {tab === "risks" ? <Risks review={review.data} contractId={contractId} canCreate={canUpload} /> : null}
            {tab === "obligations" ? <Obligations review={review.data} contractId={contractId} canCreate={canUpload} /> : null}
            {tab === "ask" ? (
              <QuestionPanel path={`/organizations/${encodeURIComponent(organizationId)}/contracts/${encodeURIComponent(contractId)}/questions`} placeholder="Ask about this agreement…" suggestions={suggestions}
                disabled={!item.retain_source_text} disabledReason="This contract’s extracted text wasn’t kept, so there is nothing to search. Upload it again with “Keep the extracted text” on." />
            ) : null}
            {tab === "negotiate" ? <ContractNegotiate contractId={contractId} /> : null}
            {tab === "discussion" ? <ContractDiscussion contractId={contractId} /> : null}
            {tab === "decisions" ? <ContractDecisions contractId={contractId} /> : null}
            {tab === "actions" ? <ContractActions contractId={contractId} /> : null}
            {tab === "lifecycle" ? <ContractLifecycle contractId={contractId} /> : null}
            {tab === "activity" ? <ContractActivity contractId={contractId} /> : null}
          </>
        )}
      </ScrollView>

      {showDock ? (
        <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
          {canUpload ? <Button label="Record decision" variant="secondary" style={styles.flex} onPress={() => router.push({ pathname: "/new/decision", params: { contractId } })} /> : null}
          <Button label={risks.length ? `Review ${risks.length} ${risks.length === 1 ? "risk" : "risks"}` : "Open passport"} style={styles.flex} onPress={() => setTab(risks.length ? "risks" : "passport")} />
        </View>
      ) : null}
      <ShareSheet contractId={contractId} title={title} visible={sharing} onClose={() => setSharing(false)} />
    </KeyboardAvoidingView>
  );
}

function Overview({ review, loading, error, onRetry, onOpenTab }: { review?: Review; loading: boolean; error: unknown; onRetry: () => void; onOpenTab: (tab: Tab) => void }) {
  const styles = useStyles();
  if (loading) return <Loading rows={6} />;
  if (error || !review) return <ErrorState error={error ?? new Error("The review isn’t available yet.")} onRetry={onRetry} />;
  const analysis = review.analysis;
  const risks = analysis.risk_assessment ?? [];
  const high = risks.filter((risk) => severity(risk.risk_level) === "high").length;
  const plural = (count: number) => (count === 1 ? "risk" : "risks");
  const riskTitle = high ? `${high} high ${plural(high)}` : risks.length ? `${risks.length} ${plural(risks.length)}` : "No risks flagged";
  const gaps = list(analysis.missing_protections);
  const dates = list(analysis.deadlines);
  const unsure = list(analysis.uncertainties);
  return (
    <>
      <AppText style={styles.summary} selectable>{analysis.executive_summary || "No summary was returned for this review."}</AppText>
      <Section title="Before you sign">
        <View>
          <ListRow icon="alert" title={riskTitle} subtitle={risks.slice(0, 2).map((risk) => asText(risk.title, "")).filter(Boolean).join(", ") || undefined} onPress={() => onOpenTab("risks")} />
          {gaps.length ? <ListRow icon="help" title={`${gaps.length} possible ${gaps.length === 1 ? "gap" : "gaps"}`} subtitle="Protections we didn’t find" onPress={() => onOpenTab("risks")} /> : null}
          <ListRow icon="shield" title="Approvals and decisions" subtitle="Who has signed off, and why" onPress={() => onOpenTab("decisions")} />
          <ListRow icon="renewals" title={dates.length ? `${dates.length} key ${dates.length === 1 ? "date" : "dates"}` : "Dates and renewals"} subtitle={asText(dates[0]?.title ?? dates[0]?.deadline ?? dates[0]?.event, "") || "Notice windows, renewals and payments"} onPress={() => onOpenTab("lifecycle")} last />
        </View>
      </Section>
      {unsure.length ? (
        <Notice icon="info" title="Couldn’t confirm" message={unsure.slice(0, 3).map((entry) => asText(entry.title ?? entry.issue ?? entry.description ?? entry.item, "")).filter(Boolean).join(" · ")} />
      ) : null}
      <AppText variant="caption" tone="faint">This is a first-pass review, not legal advice.</AppText>
    </>
  );
}

function Risks({ review, contractId, canCreate }: { review?: Review; contractId: string; canCreate: boolean }) {
  const risks = review?.analysis.risk_assessment ?? [];
  const gaps = list(review?.analysis.missing_protections);
  if (!review) return <Loading rows={5} />;
  const order = { high: 0, medium: 1, low: 2 } as const;
  const sorted = risks.map((finding, index) => ({ finding, index })).sort((a, b) => order[severity(a.finding.risk_level)] - order[severity(b.finding.risk_level)]);
  return (
    <>
      {sorted.length ? (
        <View>{sorted.map(({ finding, index }, position) => <Finding key={index} finding={finding} index={index} contractId={contractId} canCreate={canCreate} last={position === sorted.length - 1} />)}</View>
      ) : <EmptyState title="No risks flagged" message="The review didn’t find clauses that need attention. Check the document yourself before relying on that." />}
      {gaps.length ? (
        <Section title={`Possible gaps · ${gaps.length}`} description="A gap means a protection wasn’t found, not that the law requires it.">
          <View>{gaps.map((gap, index) => <ListRow key={index} title={asText(gap.title ?? gap.issue ?? gap.item ?? gap.protection, "Missing protection")} subtitle={asText(gap.description ?? gap.explanation ?? gap.recommendation, "") || "Not found in the document."} last={index === gaps.length - 1} />)}</View>
        </Section>
      ) : null}
    </>
  );
}

function Obligations({ review, contractId, canCreate }: { review?: Review; contractId: string; canCreate: boolean }) {
  const [kind, setKind] = useState<"obligation" | "payment" | "deadline">("obligation");
  if (!review) return <Loading rows={5} />;
  const analysis = review.analysis;
  const items = { obligation: list(analysis.obligations), payment: list(analysis.payments), deadline: list(analysis.deadlines) };
  return (
    <>
      <Segmented label="Record type" value={kind} onChange={setKind} options={[
        { value: "obligation", label: `Obligations ${items.obligation.length}` }, { value: "payment", label: `Payments ${items.payment.length}` }, { value: "deadline", label: `Dates ${items.deadline.length}` },
      ]} />
      <AppText variant="small" tone="muted">Check owners, amounts and dates before they go into your records.</AppText>
      <RecordCards items={items[kind]} empty={`No ${kind === "deadline" ? "dates" : `${kind}s`} were extracted.`} contractId={contractId} category={kind} canCreate={canCreate} />
    </>
  );
}

const steps = ["Uploaded privately", "Text extracted", "Analysing clauses and obligations", "Checking every citation"];

function Processing({ contract }: { contract: Contract }) {
  const styles = useStyles();
  const progress = reviewJobProgress(contract.latest_job);
  return (
    <>
      <View style={styles.steps}>
        <AppText variant="smallStrong">{progress || "Reviewing"}</AppText>
        {steps.map((step) => <AppText key={step} variant="small" tone="muted">{`·  ${step}`}</AppText>)}
      </View>
      <AppText tone="muted">Usually about a minute. You can leave this screen; the review appears in Agreements and your notifications when it’s ready.</AppText>
      <Button label="Back to agreements" variant="secondary" onPress={() => router.back()} />
    </>
  );
}

function Failed({ contract, canUpload }: { contract: Contract; canUpload: boolean }) {
  const reference = reviewJobReference(contract.latest_job?.id);
  return (
    <>
      <Notice tone="danger" icon="xCircle" title="We couldn’t read this document" message={reviewJobMessage(contract.latest_job)} />
      <Section title="Try this">
        <View>
          <ListRow title="Export the original from Word or your e-signature tool as a PDF" />
          <ListRow title="If it only exists on paper, scan it with text recognition (OCR) turned on" />
          <ListRow title="Check every page is included and readable" last />
        </View>
      </Section>
      {reference ? <AppText variant="caption" tone="faint">{`Reference ${reference}`}</AppText> : null}
      {canUpload ? <Button label="Upload a new copy" onPress={() => router.push("/new/contract")} /> : null}
    </>
  );
}

const useStyles = createStyles((c) => ({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  screen: { flex: 1, backgroundColor: c.canvas },
  pad: { flex: 1, padding: gutter, gap: space.lg, backgroundColor: c.canvas },
  content: { paddingHorizontal: gutter, paddingTop: space.sm, gap: space.xl - 4 },
  head: { gap: space.sm },
  title: { fontFamily: font.semibold, fontSize: 26, lineHeight: 32, letterSpacing: -0.4 },
  meta: { flexDirection: "row", alignItems: "center", gap: space.sm + 2 },
  summary: { fontFamily: font.regular, fontSize: 17, lineHeight: 26 },
  steps: { gap: space.sm, padding: 18, borderRadius: 16, backgroundColor: c.raised },
  dock: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: space.md, paddingHorizontal: gutter, paddingTop: space.md, backgroundColor: c.canvas },
}));
