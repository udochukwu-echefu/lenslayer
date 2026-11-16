import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { FormScreen } from "@/components/form-screen";
import { OneTimeSecret } from "@/components/one-time-secret";
import { AppText, ListRow, TextField } from "@/components/ui";
import { api } from "@/lib/api";
import { config } from "@/lib/config";
import type { Role } from "@/lib/shared/types";
import { useWorkspace } from "@/lib/workspace";
import { createStyles } from "@/theme/create-styles";

type InviteRole = Exclude<Role, "owner">;
const roles: { value: InviteRole; label: string; description: string }[] = [
  { value: "admin", label: "Admin", description: "Manages people and settings, can delete contracts" },
  { value: "reviewer", label: "Reviewer", description: "Uploads, reviews, decides and assigns actions" },
  { value: "viewer", label: "Viewer", description: "Reads reviews and evidence; changes nothing" },
];

/** Invite a teammate by email. The link works once, only for that address, and expires after 7 days. */
export default function NewInvitationScreen() {
  const styles = useStyles();
  const { organizationId } = useWorkspace();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("reviewer");
  const invite = useMutation({
    mutationFn: () => api.createInvitation(organizationId, { email: email.trim().toLowerCase(), role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invitations", organizationId] }),
  });
  if (invite.data) {
    return <OneTimeSecret title={`Send this link to ${invite.data.invitation.email.split("@")[0]}`} description="Share it now. You can always revoke it from Team." value={`${config.webUrl}/invite/${invite.data.token}`}
      warning="For security, the full link is shown only once." shareLabel="Share invitation…" />;
  }
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  return (
    <FormScreen submitLabel="Create invitation" onSubmit={() => invite.mutate()} disabled={!valid} loading={invite.isPending} error={invite.error} needsEditor={false}
      footnote="The link expires in 7 days and only works for this email address.">
      <TextField label="Work email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoFocus placeholder="name@company.com" />
      <View>
        <AppText variant="smallStrong" tone="muted">Starting role</AppText>
        {roles.map((item, index) => (
          <ListRow key={item.value} title={item.label} subtitle={item.description} onPress={() => setRole(item.value)} last={index === roles.length - 1}
            trailing={<View style={[styles.radio, role === item.value && styles.radioOn]}>{role === item.value ? <View style={styles.dot} /> : null}</View>} />
        ))}
      </View>
    </FormScreen>
  );
}

const useStyles = createStyles((c) => ({
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: c.lineStrong, alignItems: "center", justifyContent: "center" },
  radioOn: { borderColor: c.primary },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: c.primary },
}));
