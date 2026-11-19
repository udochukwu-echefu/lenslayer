import { useEffect } from "react";
import { Modal, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppLock } from "@/lib/app-lock";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { createStyles } from "@/theme/create-styles";
import { useTheme } from "@/theme/theme-provider";
import { gutter, space } from "@/theme/tokens";
import { AppText, Avatar, Button } from "./ui";

/**
 * Covers the whole app while it is locked, so nothing from the workspace shows
 * behind the Face ID prompt or in the app switcher. It asks once on its own;
 * the button is there if the person cancelled or the scan failed.
 */
export function LockScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { method, unlock } = useAppLock();
  const { signOut } = useAuth();
  const { user, activeOrganization } = useWorkspace();
  const name = user?.display_name || user?.email || "";
  const first = name.split(/[\s@]/)[0];

  useEffect(() => { void unlock(); }, [unlock]);

  return (
    // A Modal, not a plain overlay: it sits above any open form or sheet too.
    <Modal visible animationType="none" presentationStyle="fullScreen" onRequestClose={() => undefined}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Avatar name={name || "You"} size={72} tint={colors.decisions} />
          <View style={styles.text}>
            <AppText variant="title">{first ? `Welcome back, ${first}` : "Welcome back"}</AppText>
            {activeOrganization ? <AppText variant="small" tone="muted">{activeOrganization.name}</AppText> : null}
          </View>
        </View>
        <View style={styles.actions}>
          <Button label={`Unlock with ${method ?? "Face ID"}`} icon="faceId" onPress={() => void unlock()} />
          <Button label={first ? `Not ${first}? Sign out` : "Sign out"} variant="ghost" onPress={() => void signOut()} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const useStyles = createStyles((c) => ({
  safe: { flex: 1, paddingHorizontal: gutter, backgroundColor: c.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.lg },
  text: { alignItems: "center", gap: space.xs },
  actions: { gap: space.sm, paddingBottom: space.lg },
}));
