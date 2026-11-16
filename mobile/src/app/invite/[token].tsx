import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText, Button, ErrorState, Facts, FormError, Icon, Loading, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, titleCase } from "@/lib/format";
import { storage, storageKeys } from "@/lib/storage";
import { useWorkspace } from "@/lib/workspace";
import { createStyles } from "@/theme/create-styles";
import { gutter, space } from "@/theme/tokens";

/**
 * Opened from an invitation link (lenslayer://invite/<token>). Sits outside
 * the sign-in guards so the link works whether or not you're signed in:
 * signed out, it asks you to sign in first; signed in, it shows who invited
 * you to what, and joins on accept.
 */
export default function InvitationScreen() {
  const styles = useStyles();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { status, signIn } = useAuth();
  const { user } = useWorkspace();
  const queryClient = useQueryClient();
  const signedIn = status === "signedIn";
  const preview = useQuery({ queryKey: ["invitation", token], queryFn: () => api.invitation(token), enabled: Boolean(token) && signedIn, retry: false });
  const accept = useMutation({
    mutationFn: () => api.acceptInvitation(token),
    onSuccess: async ({ organization }) => {
      await storage.set(storageKeys.activeOrganization, organization.id);
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
      router.replace("/");
    },
  });
  const invitation = preview.data;
  const usable = invitation?.status === "pending";

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <View style={styles.body}>
        {!signedIn ? (
          <>
            <View style={styles.hero}><Icon name="mail" size={26} /></View>
            <AppText variant="display" accessibilityRole="header">You’re invited</AppText>
            <AppText tone="muted">Sign in with the email address the invitation was sent to, then open the link again.</AppText>
          </>
        ) : preview.isLoading ? <Loading rows={4} /> : preview.error || !invitation ? (
          <>
            <ErrorState error={preview.error ?? new Error("This invitation can’t be found.")} onRetry={() => void preview.refetch()} />
            <Notice icon="clock" title="Expired or already used?" message="Ask the person who invited you to send a new one." />
          </>
        ) : (
          <>
            <View style={styles.hero}><Icon name="building" size={26} /></View>
            <AppText variant="display" accessibilityRole="header">{usable ? `Join ${invitation.organization_name}` : "This invitation can’t be used"}</AppText>
            <AppText tone="muted">{usable ? `You’ve been invited as a ${titleCase(invitation.role)}.` : `It is ${invitation.status}. Ask the person who invited you to send a new one.`}</AppText>
            <Facts items={[["Sent to", invitation.email_hint], ["Signed in as", user?.email ?? "–"], ["Expires", formatDate(invitation.expires_at)]]} />
            <AppText variant="caption" tone="faint">Invitations only work for the address they were sent to.</AppText>
          </>
        )}
        <FormError error={accept.error} />
      </View>
      <View style={styles.actions}>
        {!signedIn ? <Button label="Sign in" onPress={() => void signIn()} /> : usable ? <Button label="Accept and join" loading={accept.isPending} onPress={() => accept.mutate()} /> : null}
        <Button label="Not now" variant="ghost" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      </View>
    </SafeAreaView>
  );
}

const useStyles = createStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.canvas, paddingHorizontal: gutter + 4, paddingVertical: space.xl },
  body: { flex: 1, justifyContent: "center", gap: space.lg },
  hero: { width: 64, height: 64, borderRadius: 20, backgroundColor: c.raised, alignItems: "center", justifyContent: "center" },
  actions: { gap: space.sm },
}));
