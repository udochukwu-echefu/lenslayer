import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText, Button, ErrorState, FormError, Icon, Notice, TextField } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCreateWorkspace, useWorkspace } from "@/lib/workspace";
import { createStyles } from "@/theme/create-styles";
import { gutter, space } from "@/theme/tokens";

/**
 * Shown when you're signed in but have no workspace yet, or the API refused
 * access (unverified email, network failure). Mirrors the dashboard's
 * WorkspaceGate. Three states: verify your email, name your workspace, or an
 * error with a retry.
 */
export default function WorkspaceSetupScreen() {
  const styles = useStyles();
  const { error } = useWorkspace();
  const { signOut, reauthenticate } = useAuth();
  const queryClient = useQueryClient();
  const create = useCreateWorkspace();
  const [name, setName] = useState("");
  const verify = error instanceof ApiError && error.status === 403 && /verify your email/i.test(error.message);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.page}>
        {verify ? (
          <>
            <View style={styles.body}>
              <View style={styles.hero}><Icon name="mail" size={26} /></View>
              <AppText variant="display" accessibilityRole="header">Verify your email</AppText>
              <AppText tone="muted">We sent a link to the address you signed up with. Open it on any device, then come back here. Your workspace stays locked until you do, so nobody can use your address without you.</AppText>
            </View>
            <View style={styles.actions}>
              <Button label="I’ve verified my email" onPress={() => void reauthenticate()} />
              <Button label="Use a different account" variant="ghost" onPress={() => void signOut()} />
            </View>
          </>
        ) : error ? (
          <>
            <View style={styles.body}>
              <ErrorState error={error} onRetry={() => void queryClient.invalidateQueries({ queryKey: ["organizations"] })} />
              <Notice title="Can’t reach your workspaces" message="Check the API address in mobile/.env.local and that the backend is running." icon="alert" tone="warning" />
            </View>
            <Button label="Sign out" variant="ghost" onPress={() => void signOut()} />
          </>
        ) : (
          <>
            <View style={styles.body}>
              <AppText variant="display" accessibilityRole="header">Name your workspace</AppText>
              <AppText tone="muted">A workspace holds your team’s agreements, reviews and renewal dates. Most teams use their company or department name.</AppText>
              <TextField label="Workspace name" value={name} onChangeText={setName} placeholder="e.g. Acme legal" maxLength={255} autoFocus help="You can change this later in Settings." />
              <FormError error={create.error} />
            </View>
            <View style={styles.actions}>
              <Button label="Continue" loading={create.isPending} disabled={name.trim().length < 2} onPress={() => create.mutate(name)} />
              <AppText variant="small" tone="muted" style={styles.center}>Joining a team? Open the invitation link from your email.</AppText>
              <Button label="Sign out" variant="ghost" onPress={() => void signOut()} />
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = createStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.canvas },
  page: { flex: 1, paddingHorizontal: gutter + 4, paddingVertical: space.xl, gap: space.xl, maxWidth: 560, width: "100%", alignSelf: "center" },
  body: { flex: 1, justifyContent: "center", gap: space.lg },
  hero: { width: 64, height: 64, borderRadius: 20, backgroundColor: c.raised, alignItems: "center", justifyContent: "center" },
  actions: { gap: space.sm + 2 },
  center: { textAlign: "center" },
}));
