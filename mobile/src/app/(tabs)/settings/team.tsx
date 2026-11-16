import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { HeaderButton } from "@/components/header";
import { AppText, Avatar, confirm, ErrorState, FormError, Icon, Loading, OptionSheet, Screen, SearchField, Section } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, titleCase } from "@/lib/format";
import { useMembers } from "@/lib/queries";
import type { Membership, Role } from "@/lib/shared/types";
import { useWorkspace } from "@/lib/workspace";
import { createStyles } from "@/theme/create-styles";
import { useTheme } from "@/theme/theme-provider";
import { space } from "@/theme/tokens";

type Choice = Exclude<Role, "owner"> | "remove";
const choices: { value: Choice; label: string; description: string }[] = [
  { value: "admin", label: "Admin", description: "Manages people and settings, deletes contracts" },
  { value: "reviewer", label: "Reviewer", description: "Uploads, reviews, decides and assigns actions" },
  { value: "viewer", label: "Viewer", description: "Reads reviews and evidence; changes nothing" },
  { value: "remove", label: "Remove from workspace…", description: "They lose access straight away" },
];

/** Members, their roles, and pending invitations. Owners and admins can change both. */
export default function TeamScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { organizationId, user, canManageTeam } = useWorkspace();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Membership | null>(null);
  const members = useMembers(organizationId);
  const invitations = useQuery({ queryKey: ["invitations", organizationId], queryFn: () => api.invitations(organizationId), enabled: Boolean(organizationId) && canManageTeam });
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ["members", organizationId] }), queryClient.invalidateQueries({ queryKey: ["invitations", organizationId] })]);
  const setRole = useMutation({ mutationFn: ({ id, role }: { id: string; role: Role }) => api.updateMemberRole(organizationId, id, role), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => api.removeMember(organizationId, id), onSuccess: refresh });
  const revoke = useMutation({ mutationFn: (id: string) => api.revokeInvitation(organizationId, id), onSuccess: refresh });

  const needle = search.trim().toLowerCase();
  const people = (members.data ?? []).filter((member) => !needle || `${member.display_name} ${member.email}`.toLowerCase().includes(needle));
  const pending = (invitations.data ?? []).filter((invitation) => invitation.status === "pending");

  async function choose(member: Membership, choice: Choice) {
    setEditing(null);
    if (choice === "remove") {
      if (await confirm(`Remove ${member.display_name || member.email}?`, "They lose access to this workspace straight away. Their past activity stays in the record.", "Remove")) remove.mutate(member.id);
    } else if (choice !== member.role) setRole.mutate({ id: member.id, role: choice });
  }

  return (
    <Screen onRefresh={() => void refresh()} contentStyle={{ gap: space.xl - 4 }}>
      <Stack.Screen options={{ headerRight: canManageTeam ? () => <HeaderButton icon="plus" label="Invite a teammate" onPress={() => router.push("/new/invitation")} /> : undefined }} />
      {(members.data?.length ?? 0) > 6 ? <SearchField label="Search members" value={search} onChangeText={setSearch} placeholder={`Search ${members.data?.length} members`} /> : null}
      <FormError error={setRole.error ?? remove.error ?? revoke.error} />

      {members.isLoading ? <Loading rows={5} /> : members.error ? <ErrorState error={members.error} onRetry={() => void members.refetch()} /> : (
        <View>
          {people.map((member, index) => {
            const me = member.user_id === user?.id;
            const editable = canManageTeam && !me && member.role !== "owner";
            return (
              <Pressable key={member.id} accessibilityRole="button" disabled={!editable} onPress={() => setEditing(member)} style={[styles.row, index < people.length - 1 && styles.divider]}>
                <Avatar name={member.display_name || member.email} tint={me ? colors.decisions : undefined} />
                <View style={styles.flex}>
                  <AppText variant="bodyStrong" numberOfLines={1}>{member.display_name || member.email}{me ? " · You" : ""}</AppText>
                  <AppText variant="small" tone="muted" numberOfLines={1}>{member.email}</AppText>
                </View>
                <AppText variant="small" tone="muted">{titleCase(member.role)}</AppText>
                {editable ? <Icon name="chevronRight" size={13} color={colors.faint} /> : null}
              </Pressable>
            );
          })}
        </View>
      )}

      {pending.length ? (
        <Section title={`Pending · ${pending.length}`}>
          <View>
            {pending.map((invitation, index) => (
              <View key={invitation.id} style={[styles.row, index < pending.length - 1 && styles.divider]}>
                <Icon name="mail" size={20} />
                <View style={styles.flex}>
                  <AppText variant="bodyStrong" numberOfLines={1}>{invitation.email}</AppText>
                  <AppText variant="small" tone="muted">{`${titleCase(invitation.role)} · expires ${formatDate(invitation.expires_at, { day: "numeric", month: "short" })}`}</AppText>
                </View>
                <Pressable accessibilityRole="button" hitSlop={10} onPress={() => revoke.mutate(invitation.id)}><AppText variant="smallStrong" tone="danger">Revoke</AppText></Pressable>
              </View>
            ))}
          </View>
        </Section>
      ) : null}
      {!canManageTeam ? <AppText variant="caption" tone="faint">Only owners and admins can invite people or change roles.</AppText> : null}

      <OptionSheet title={editing ? editing.display_name || editing.email : "Role"} visible={Boolean(editing)} value={editing?.role === "owner" ? undefined : editing?.role} options={choices}
        onClose={() => setEditing(null)} onSelect={(choice) => { if (editing) void choose(editing, choice); }} />
    </Screen>
  );
}

const useStyles = createStyles((c) => ({
  row: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 64, paddingVertical: 10 },
  divider: { borderBottomWidth: 1, borderBottomColor: c.line },
  flex: { flex: 1, gap: space.xxs },
}));
