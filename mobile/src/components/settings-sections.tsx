import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { config } from "@/lib/config";
import { formatDate, formatRelativeDate, titleCase } from "@/lib/format";
import type { OrganizationSettings } from "@/lib/shared/types";
import { useWorkspace } from "@/lib/workspace";
import { createStyles } from "@/theme/create-styles";
import { useTheme, type ThemePreference } from "@/theme/theme-provider";
import { space } from "@/theme/tokens";
import { BrandMark } from "./brand-mark";
import { AppText, Avatar, Badge, Button, confirm, ErrorState, Facts, FormError, Icon, ListRow, Loading, Notice, Section, Segmented, TextField, ToggleRow } from "./ui";

/** Shared read/write of workspace settings. Each control saves on change; there is no Save button to forget. */
function useSettings() {
  const { organizationId } = useWorkspace();
  const queryClient = useQueryClient();
  const key = ["organization-settings", organizationId];
  const query = useQuery({ queryKey: key, queryFn: () => api.organizationSettings(organizationId), enabled: Boolean(organizationId) });
  const save = useMutation({
    mutationFn: (patch: Parameters<typeof api.updateOrganizationSettings>[1]) => api.updateOrganizationSettings(organizationId, patch),
    onSuccess: (data: OrganizationSettings) => { queryClient.setQueryData(key, data); void queryClient.invalidateQueries({ queryKey: ["organizations"] }); },
  });
  return { query, save };
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <ListRow title={value} subtitle={label} trailing={
      <Button label={copied ? "Copied" : "Copy"} variant="secondary" compact onPress={async () => { await Clipboard.setStringAsync(value); setCopied(true); setTimeout(() => setCopied(false), 2000); }} />
    } />
  );
}

export function ProfileSection() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { user, activeOrganization, activeRole } = useWorkspace();
  const { signOut } = useAuth();
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const preview = useQuery({ queryKey: ["account-deletion"], queryFn: api.accountDeletionPreview, enabled: deleting });
  const remove = useMutation({ mutationFn: () => api.deleteAccount("DELETE"), onSuccess: () => signOut() });
  const blocking = preview.data?.blocking_workspaces ?? [];
  return (
    <>
      <View style={styles.center}>
        <Avatar name={user?.display_name || user?.email || "You"} size={84} tint={colors.decisions} />
        <AppText variant="title">{user?.display_name || "Your profile"}</AppText>
        <AppText variant="small" tone="muted">{`${titleCase(activeRole ?? "member")} · ${activeOrganization?.name ?? ""}`}</AppText>
      </View>
      <View>
        <Facts items={[["Name", user?.display_name || "–"], ["Email", user?.email || "–"], ["User ID", user?.id || "–"]]} />
        <AppText variant="caption" tone="faint" style={styles.note}>Name and email come from your sign-in account. Actions you take are recorded with your name and active workspace.</AppText>
      </View>

      {!deleting ? <Button label="Delete account…" variant="ghost" onPress={() => setDeleting(true)} style={styles.dangerLink} /> : (
        <Section title="Delete your account">
          <View style={styles.stack}>
            <AppText variant="small" tone="muted">Workspaces where you’re the only member are deleted, with their contracts, reviews and files. In shared workspaces you’re removed, and your past activity shows as “Deleted user”. Your API keys stop working immediately.</AppText>
            {preview.isLoading ? <Loading rows={1} /> : blocking.length ? (
              <Notice tone="warning" icon="alert" title="First, hand over ownership" message={`You’re the only owner of ${blocking.join(", ")}. Make another member an owner, then come back.`} />
            ) : (
              <>
                <TextField label="Type DELETE to confirm" value={confirmText} onChangeText={setConfirmText} autoCapitalize="characters" autoCorrect={false} placeholder="DELETE" />
                <Button label="Permanently delete account" variant="danger" disabled={confirmText.trim() !== "DELETE"} loading={remove.isPending} onPress={() => remove.mutate()} />
                <AppText variant="caption" tone="faint" style={{ textAlign: "center" }}>This can’t be undone.</AppText>
              </>
            )}
            <FormError error={preview.error ?? remove.error} />
          </View>
        </Section>
      )}
    </>
  );
}

export function GeneralSection() {
  const styles = useStyles();
  const { activeOrganization, activeRole, canManageTeam, organizationId } = useWorkspace();
  const { query, save } = useSettings();
  const intake = useQuery({ queryKey: ["intake-address", organizationId], queryFn: () => api.intakeEmailAddress(organizationId), enabled: Boolean(organizationId) });
  const [name, setName] = useState<string | null>(null);
  const current = name ?? query.data?.name ?? "";
  const dirty = name !== null && name.trim() !== query.data?.name && name.trim().length >= 2;
  if (query.isLoading) return <Loading rows={5} />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return (
    <>
      <View style={styles.stack}>
        <TextField label="Name" value={current} onChangeText={setName} editable={canManageTeam} maxLength={255} help="Shown in the workspace switcher, exports and invitations." />
        {dirty ? <Button label="Save name" loading={save.isPending} onPress={() => save.mutate({ name: current.trim() }, { onSuccess: () => setName(null) })} /> : null}
        <FormError error={save.error} />
      </View>
      {intake.data?.enabled ? (
        <Section title="Forward contracts by email">
          <View>
            <CopyRow label="Attachments become new reviews" value={intake.data.address} />
          </View>
        </Section>
      ) : null}
      <View>
        <Facts items={[["Your role", titleCase(activeRole ?? "member")], ["Created", formatDate(activeOrganization?.created_at)], ["Workspace ID", activeOrganization?.slug ?? "–"]]} />
        {!canManageTeam ? <AppText variant="caption" tone="faint" style={styles.note}>Only owners and admins can change workspace settings.</AppText> : null}
      </View>
    </>
  );
}

export function DataSection() {
  const styles = useStyles();
  const { canManageTeam } = useWorkspace();
  const { query, save } = useSettings();
  if (query.isLoading) return <Loading rows={5} />;
  if (query.error || !query.data) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const settings = query.data;
  return (
    <>
      <AppText tone="muted" style={styles.lead}>Defaults for new uploads. People can choose stricter handling for each contract.</AppText>
      <Section title="Delete source files after">
        <Segmented label="Retention period" value={String(settings.default_retention_days) as "7" | "30" | "90" | "365"} onChange={(value) => canManageTeam && save.mutate({ default_retention_days: Number(value) as 7 | 30 | 90 | 365 })}
          options={[{ value: "7", label: "7 days" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }, { value: "365", label: "1 year" }]} />
      </Section>
      <View>
        <ToggleRow label="Keep original files" help="For downloads and reprocessing" value={settings.default_retain_document} disabled={!canManageTeam} onChange={(value) => save.mutate({ default_retain_document: value })} />
        <ToggleRow label="Keep extracted text" help="Needed for Ask and contract questions" value={settings.default_retain_source_text} disabled={!canManageTeam} onChange={(value) => save.mutate({ default_retain_source_text: value })} />
      </View>
      <FormError error={save.error} />
      <Notice icon="info" title="Existing uploads keep their own setting" message="Changing defaults doesn’t extend anything already uploaded. Review reports stay until someone deletes them." />
    </>
  );
}

export function NotificationsSection() {
  const styles = useStyles();
  const { canManageTeam } = useWorkspace();
  const { query, save } = useSettings();
  if (query.isLoading) return <Loading rows={3} />;
  if (query.error || !query.data) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return (
    <>
      <AppText tone="muted" style={styles.lead}>What the workspace tells people about. Alerts appear in the app’s notification list and by email.</AppText>
      <Section title="Tell the team about">
        <View>
          <ToggleRow label="Reviews that are ready" help="When a first-pass review finishes" value={query.data.notification_review_ready} disabled={!canManageTeam} onChange={(value) => save.mutate({ notification_review_ready: value })} />
          <ToggleRow label="Reviews that failed" help="When a document couldn’t be read" value={query.data.notification_review_failed} disabled={!canManageTeam} onChange={(value) => save.mutate({ notification_review_failed: value })} />
        </View>
      </Section>
      <FormError error={save.error} />
      <Notice icon="info" title="Date reminders are set per date" message="Each renewal or notice date has its own reminder (for example 14 days before) and goes to its owner. Admins are told if a date passes still open." />
      {!canManageTeam ? <AppText variant="caption" tone="faint">Only owners and admins can change these.</AppText> : null}
    </>
  );
}

export function SecuritySection() {
  const styles = useStyles();
  const { organizationId, activeRole } = useWorkspace();
  const queryClient = useQueryClient();
  const keys = useQuery({ queryKey: ["api-keys", organizationId], queryFn: () => api.apiKeys(organizationId), enabled: Boolean(organizationId) });
  const audit = useQuery({ queryKey: ["audit-events", organizationId], queryFn: () => api.auditEvents(organizationId), enabled: Boolean(organizationId) });
  const revoke = useMutation({ mutationFn: (id: string) => api.revokeApiKey(organizationId, id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys", organizationId] }) });
  const [showAudit, setShowAudit] = useState(false);
  return (
    <>
      <View>
        <ListRow title="Your role" value={titleCase(activeRole ?? "member")} />
        <ListRow title="Who has access" subtitle="Members and pending invitations" onPress={() => router.push("/settings/team")} />
        <ListRow title="Audit log" subtitle="Every invitation, role change and deletion" onPress={() => setShowAudit((value) => !value)} last={!showAudit} />
        {showAudit ? (audit.isLoading ? <Loading rows={3} /> : audit.error ? <ErrorState error={audit.error} onRetry={() => void audit.refetch()} /> : (
          (audit.data ?? []).slice(0, 20).map((event, index, all) => (
            <ListRow key={event.id} title={titleCase(event.action.replaceAll(".", " "))} subtitle={`${event.actor_name || "System"} · ${formatRelativeDate(event.created_at)}`} last={index === all.length - 1} />
          ))
        )) : null}
      </View>

      <Section title="API keys" action={{ label: "New key", onPress: () => router.push("/new/api-key") }}>
        {keys.isLoading ? <Loading rows={2} /> : keys.error ? <ErrorState error={keys.error} onRetry={() => void keys.refetch()} /> : (keys.data ?? []).length ? (
          <View>
            {(keys.data ?? []).map((key, index, all) => (
              <ListRow key={key.id} icon="key" title={key.name}
                subtitle={key.revoked_at ? `Revoked ${formatDate(key.revoked_at, { day: "numeric", month: "short" })}` : `${key.key_prefix}… · ${key.last_used_at ? `used ${formatRelativeDate(key.last_used_at)}` : "never used"}`}
                last={index === all.length - 1}
                trailing={key.revoked_at ? undefined : (
                  <Pressable accessibilityRole="button" hitSlop={10} onPress={async () => { if (await confirm(`Revoke “${key.name}”?`, "Anything using this key stops working straight away.", "Revoke")) revoke.mutate(key.id); }}>
                    <AppText variant="smallStrong" tone="danger">Revoke</AppText>
                  </Pressable>
                )} />
            ))}
          </View>
        ) : <AppText variant="small" tone="muted">No API keys yet.</AppText>}
        <FormError error={revoke.error} />
      </Section>
      <AppText variant="caption" tone="faint" style={styles.note}>Keys act for the workspace, not for you. Revoking stops new requests; it doesn’t undo past ones.</AppText>
    </>
  );
}

export function IntegrationsSection() {
  const { organizationId, canManageTeam } = useWorkspace();
  const queryClient = useQueryClient();
  const providers = useQuery({ queryKey: ["integration-providers", organizationId], queryFn: () => api.integrationProviders(organizationId), enabled: Boolean(organizationId) });
  const connections = useQuery({ queryKey: ["integrations", organizationId], queryFn: () => api.integrations(organizationId), enabled: Boolean(organizationId) });
  const webhooks = useQuery({ queryKey: ["webhooks", organizationId], queryFn: () => api.webhooks(organizationId), enabled: Boolean(organizationId) && canManageTeam });
  const deliveries = useQuery({ queryKey: ["webhook-deliveries", organizationId], queryFn: () => api.webhookDeliveries(organizationId), enabled: Boolean(organizationId) && canManageTeam });
  const revokeHook = useMutation({ mutationFn: (id: string) => api.revokeWebhook(organizationId, id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhooks", organizationId] }) });
  const disconnect = useMutation({ mutationFn: (id: string) => api.revokeIntegration(organizationId, id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["integrations", organizationId] }) });
  if (providers.isLoading || connections.isLoading) return <Loading rows={6} />;
  if (providers.error) return <ErrorState error={providers.error} onRetry={() => void providers.refetch()} />;
  const active = (connections.data ?? []).filter((connection) => connection.status !== "revoked");
  return (
    <>
      <Section title="Connected services">
        <View>
          {(providers.data ?? []).map((provider, index, all) => {
            const connection = active.find((item) => item.provider === provider.provider);
            return (
              <ListRow key={provider.provider} title={provider.display_name} subtitle={connection ? connection.external_account_id || connection.display_name : titleCase(provider.category)} last={index === all.length - 1}
                trailing={connection ? (
                  canManageTeam ? (
                    <Pressable accessibilityRole="button" hitSlop={10} onPress={async () => { if (await confirm(`Disconnect ${provider.display_name}?`, "Imports from this service stop. Contracts already imported stay.", "Disconnect")) disconnect.mutate(connection.id); }}>
                      <Badge tone={connection.status === "error" ? "danger" : "success"} label={connection.status === "error" ? "Error" : "Connected"} />
                    </Pressable>
                  ) : <Badge tone="success" label="Connected" />
                ) : <Badge label={provider.configured ? "Not set up" : "Unavailable"} />} />
            );
          })}
        </View>
        <FormError error={disconnect.error} />
      </Section>
      <AppText variant="caption" tone="faint">Connecting a new account opens its consent screen, which works best in the web workspace.</AppText>

      {canManageTeam ? (
        <Section title="Webhooks" action={{ label: "Add", onPress: () => router.push("/new/webhook") }}>
          {(webhooks.data ?? []).length ? (
            <View>
              {(webhooks.data ?? []).map((hook, index, all) => (
                <ListRow key={hook.id} icon="bolt" title={hook.description || hook.target_url} subtitle={`${hook.events.length} ${hook.events.length === 1 ? "event" : "events"} · ${hook.last_delivery_at ? `last delivery ${formatRelativeDate(hook.last_delivery_at)}` : "no deliveries yet"}`} last={index === all.length - 1}
                  trailing={<Pressable accessibilityRole="button" hitSlop={10} onPress={async () => { if (await confirm("Remove this webhook?", "LensLayer stops sending events to this address.", "Remove")) revokeHook.mutate(hook.id); }}><AppText variant="smallStrong" tone="danger">Remove</AppText></Pressable>} />
              ))}
            </View>
          ) : <AppText variant="small" tone="muted">No webhooks yet.</AppText>}
          <FormError error={revokeHook.error} />
        </Section>
      ) : null}
      {canManageTeam && (deliveries.data ?? []).length ? (
        <Section title="Recent deliveries">
          <View>
            {(deliveries.data ?? []).slice(0, 8).map((delivery, index, all) => (
              <ListRow key={delivery.id} title={delivery.event_type} subtitle={`${formatRelativeDate(delivery.created_at)}${delivery.attempts > 1 ? ` · ${delivery.attempts} attempts` : ""}`} last={index === all.length - 1}
                trailing={<Badge tone={delivery.status === "delivered" || delivery.status === "succeeded" ? "success" : delivery.status === "failed" ? "danger" : "warning"} label={titleCase(delivery.status)} />} />
            ))}
          </View>
        </Section>
      ) : null}
    </>
  );
}

export function AppearanceSection() {
  const styles = useStyles();
  const { preference, setPreference } = useTheme();
  const options: { value: ThemePreference; label: string; description: string }[] = [
    { value: "system", label: "System", description: "Follows your phone and switches at sunset if you’ve set that up" },
    { value: "light", label: "Light", description: "White page, dark text" },
    { value: "dark", label: "Dark", description: "Dark page, light text" },
  ];
  return (
    <>
      <View>
        {options.map((option, index) => {
          const selected = option.value === preference;
          return (
            <ListRow key={option.value} title={option.label} subtitle={option.description} onPress={() => setPreference(option.value)} last={index === options.length - 1}
              trailing={<View style={[styles.radio, selected && styles.radioOn]}>{selected ? <View style={styles.radioDot} /> : null}</View>} />
          );
        })}
      </View>
      <AppText variant="caption" tone="faint">Text size follows your phone’s accessibility settings.</AppText>
    </>
  );
}

export function AboutSection() {
  const styles = useStyles();
  const { colors } = useTheme();
  const link = (path: string) => () => void Linking.openURL(`${config.webUrl}${path}`);
  const external = <Icon name="external" size={13} color={colors.faint} />;
  return (
    <>
      <View style={styles.center}>
        <BrandMark size={40} showName={false} />
        <AppText variant="title">LensLayer</AppText>
        <AppText variant="small" tone="muted">{`Version ${Constants.expoConfig?.version ?? "1.0.0"}`}</AppText>
      </View>
      <Notice icon="info" title="First-pass review, not legal advice" message="LensLayer says what it found and what it couldn’t confirm. Bring in counsel for decisions that need it." />
      <View>
        <ListRow title="How reviews work" onPress={link("/how-it-works")} trailing={external} />
        <ListRow title="Terms of service" onPress={link("/terms")} trailing={external} />
        <ListRow title="Privacy policy" onPress={link("/privacy")} trailing={external} />
        <ListRow title="Contact support" subtitle="Include the reference code from any error screen" onPress={() => void Linking.openURL("mailto:support@lenslayer.app")} trailing={external} last />
      </View>
    </>
  );
}

const useStyles = createStyles((c) => ({
  center: { alignItems: "center", gap: space.xs + 2, paddingVertical: space.sm },
  stack: { gap: space.lg },
  note: { marginTop: space.md },
  lead: { fontSize: 15, marginTop: -space.sm },
  dangerLink: { minHeight: 44 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: c.lineStrong, alignItems: "center", justifyContent: "center" },
  radioOn: { borderColor: c.primary },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: c.primary },
}));
