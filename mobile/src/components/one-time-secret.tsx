import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, Share, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createStyles } from "@/theme/create-styles";
import { gutter, radius, space } from "@/theme/tokens";
import { AppText, Button, Icon, Notice } from "./ui";

/**
 * Shown once after creating an invitation link, an API key or a webhook
 * secret. The server stores only a hash, so this screen is the only time the
 * full value exists. Copy it now; there is no "show again".
 */
export function OneTimeSecret({ title, description, value, warning, shareLabel }: { title: string; description: string; value: string; warning?: string; shareLabel?: string }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.hero}><Icon name="check" size={24} /></View>
      <AppText variant="display" accessibilityRole="header">{title}</AppText>
      <AppText tone="muted">{description}</AppText>
      {warning ? <Notice tone="warning" icon="alert" title="Shown once" message={warning} /> : null}
      <View style={styles.value}><AppText variant="mono" selectable>{value}</AppText></View>
      <View style={styles.actions}>
        <Button label={copied ? "Copied" : "Copy"} icon="copy" onPress={async () => { await Clipboard.setStringAsync(value); setCopied(true); }} />
        {shareLabel ? <Button label={shareLabel} icon="share" variant="secondary" onPress={() => void Share.share({ message: value })} /> : null}
        <Button label="Done" variant="ghost" onPress={() => router.back()} />
      </View>
    </ScrollView>
  );
}

const useStyles = createStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.canvas },
  content: { padding: gutter, gap: space.lg },
  hero: { width: 56, height: 56, borderRadius: 18, backgroundColor: c.raised, alignItems: "center", justifyContent: "center", marginTop: space.md },
  value: { padding: space.lg, borderRadius: radius.md, borderWidth: 1, borderColor: c.line },
  actions: { gap: space.sm + 2, marginTop: space.sm },
}));
