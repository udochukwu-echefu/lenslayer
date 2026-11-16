import { router, Stack } from "expo-router";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createStyles } from "@/theme/create-styles";
import { gutter, space } from "@/theme/tokens";
import { AppText, Button, FormError, Notice } from "./ui";
import { useIsOnline } from "@/lib/online";
import { useWorkspace } from "@/lib/workspace";

/**
 * The frame every "new …" sheet shares: Cancel on the left, the fields in a
 * scrolling column, and one primary button pinned above the keyboard. Keeping
 * this in one place means all forms scroll, dodge the keyboard and report
 * errors the same way.
 */
export function FormScreen({ children, submitLabel, onSubmit, disabled, loading, error, footnote, needsEditor = true }: {
  children: React.ReactNode; submitLabel: string; onSubmit: () => void; disabled?: boolean; loading?: boolean; error?: unknown; footnote?: string;
  /** Most forms change workspace data, which viewers can't do. */
  needsEditor?: boolean;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { canUpload } = useWorkspace();
  const online = useIsOnline();
  const blocked = needsEditor && !canUpload;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex} keyboardVerticalOffset={insets.top + 44}>
      <Stack.Screen options={{ headerLeft: () => <Pressable accessibilityRole="button" hitSlop={10} onPress={() => router.back()}><AppText variant="smallStrong" tone="accent">Cancel</AppText></Pressable> }} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {blocked ? <Notice icon="eye" title="You can view, not edit" message="Your role in this workspace is Viewer. Ask an owner or admin if you need to make changes." /> : children}
      </ScrollView>
      {blocked ? null : (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
          <FormError error={error} />
          {!online ? <AppText variant="small" tone="muted">You’re offline. Connect before saving changes.</AppText> : null}
          <Button label={submitLabel} onPress={onSubmit} disabled={disabled || !online} loading={loading} />
          {footnote ? <AppText variant="caption" tone="faint" style={styles.footnote}>{footnote}</AppText> : null}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const useStyles = createStyles((c) => ({
  flex: { flex: 1, backgroundColor: c.canvas },
  content: { padding: gutter, gap: space.lg + 2 },
  footer: { paddingHorizontal: gutter, paddingTop: space.md, gap: space.sm, backgroundColor: c.canvas },
  footnote: { textAlign: "center" },
}));
