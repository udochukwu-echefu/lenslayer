import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BrandMark } from "@/components/brand-mark";
import { AppText, Button, FormError, Notice, TextField } from "@/components/ui";
import { defaultLocalIdentity, useAuth } from "@/lib/auth";
import { config } from "@/lib/config";
import { createStyles } from "@/theme/create-styles";
import { font, gutter, space } from "@/theme/tokens";

/**
 * Welcome and sign-in. "Log in" and "Sign up" open the identity provider
 * (Auth0) in a secure browser sheet, so the app never sees a password; that
 * hosted page also handles Google, Microsoft, company SSO and password reset.
 * In development, "local" mode shows a small identity form instead.
 */
export default function SignInScreen() {
  const styles = useStyles();
  const { mode, notice, signIn, signInLocally } = useAuth();
  const [busy, setBusy] = useState<"signIn" | "signUp" | "local" | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [identity, setIdentity] = useState(defaultLocalIdentity);

  async function run(kind: "signIn" | "signUp" | "local") {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "local") await signInLocally({ ...identity, id: identity.id.trim() || defaultLocalIdentity.id });
      else await signIn({ signUp: kind === "signUp" });
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <BrandMark size={32} />
          <View style={styles.hero}>
            <AppText style={styles.headline} accessibilityRole="header">Know what you agreed to. Act before it renews.</AppText>
            <AppText tone="muted">Every finding is quoted from its clause. Every renewal date has an owner.</AppText>
          </View>

          {notice ? <Notice title="You were signed out" message={notice} tone="warning" icon="lock" /> : null}

          {mode === "local" ? (
            <View style={styles.form}>
              <AppText variant="eyebrow" tone="muted">Development sign-in</AppText>
              <TextField label="Name" value={identity.name} onChangeText={(name) => setIdentity({ ...identity, name })} autoCapitalize="words" />
              <TextField label="Email" value={identity.email} onChangeText={(email) => setIdentity({ ...identity, email })} autoCapitalize="none" keyboardType="email-address" />
              <TextField label="User ID" value={identity.id} onChangeText={(id) => setIdentity({ ...identity, id })} autoCapitalize="none"
                help="Sent as the backend’s development identity. Never available in release builds." />
              <Button label="Continue" loading={busy === "local"} onPress={() => void run("local")} />
            </View>
          ) : (
            <View style={styles.form}>
              {!config.oidc.configured ? (
                <Notice tone="warning" icon="alert" title="Sign-in isn’t configured" message="Set EXPO_PUBLIC_AUTH_OIDC_ISSUER, _CLIENT_ID and _AUDIENCE in mobile/.env.local, then restart Expo." />
              ) : null}
              <View style={styles.actions}>
                <Button label="Log in" variant="secondary" loading={busy === "signIn"} disabled={!config.oidc.configured || busy !== null} onPress={() => void run("signIn")} style={styles.flex} />
                <Button label="Sign up" loading={busy === "signUp"} disabled={!config.oidc.configured || busy !== null} onPress={() => void run("signUp")} style={styles.flex} />
              </View>
            </View>
          )}
          <FormError error={error} />
          <AppText variant="caption" tone="faint" style={styles.footnote}>First-pass review, not legal advice.</AppText>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = createStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.canvas },
  flex: { flex: 1 },
  page: { flexGrow: 1, paddingHorizontal: gutter + 4, paddingVertical: space.xl, justifyContent: "center", gap: space.xl, maxWidth: 560, width: "100%", alignSelf: "center" },
  hero: { gap: space.md, marginTop: space.lg },
  headline: { fontFamily: font.bold, fontSize: 32, lineHeight: 38, letterSpacing: -0.7 },
  form: { gap: space.lg },
  actions: { flexDirection: "row", gap: space.md },
  footnote: { textAlign: "center" },
}));
