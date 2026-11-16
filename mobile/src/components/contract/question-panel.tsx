import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useQuestionStream } from "@/lib/use-question-stream";
import { createStyles } from "@/theme/create-styles";
import { useTheme } from "@/theme/theme-provider";
import { font, radius, space } from "@/theme/tokens";
import { EvidenceList } from "../evidence";
import { StructuredAnswer } from "../structured-answer";
import { AppText, Card, FormError, Icon, Notice } from "../ui";

/**
 * Ask a question, watch the provisional answer stream in, then read the final
 * evidence-grounded answer with the excerpts it used. Shared by "Ask this
 * contract" and the Ask tab.
 *
 * Order on screen: your question, sources, answer, follow-up suggestions, and
 * the composer last so it sits nearest the keyboard.
 */
export function QuestionPanel({ path, placeholder, suggestions = [], disabled, disabledReason }: {
  path: string; placeholder: string; suggestions?: string[]; disabled?: boolean; disabledReason?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [draft, setDraft] = useState("");
  const [asked, setAsked] = useState("");
  const stream = useQuestionStream(path);
  const canSend = !disabled && draft.trim().length >= 3 && !stream.isPending;

  function send(text: string) {
    const question = text.trim();
    if (question.length < 3 || disabled) return;
    setAsked(question);
    setDraft("");
    stream.ask(question);
  }

  return (
    <View style={styles.stack}>
      {disabled && disabledReason ? <Notice title="Ask is unavailable" message={disabledReason} icon="lock" /> : null}

      {asked ? <AppText variant="title" accessibilityRole="header">{asked}</AppText> : null}

      {stream.isPending && !stream.partial ? (
        <Card>
          <AppText variant="smallStrong">Working on it</AppText>
          <AppText variant="small" tone="muted">Finding the relevant clauses and checking every citation.</AppText>
        </Card>
      ) : null}

      {stream.partial && !stream.data ? (
        <View style={styles.block}>
          {stream.evidence?.length ? <EvidenceList sources={stream.evidence} title="Sources so far" /> : null}
          <AppText variant="eyebrow" tone="warning">{stream.isPending ? "Draft answer, not final" : "Incomplete answer, not verified"}</AppText>
          <StructuredAnswer text={stream.partial} />
        </View>
      ) : null}

      {stream.data ? (
        <View style={styles.block}>
          <EvidenceList sources={stream.data.sources} title="Sources" />
          <AppText variant="eyebrow" tone="muted">{stream.data.generated_by === "model" ? "Answer" : "Relevant excerpts"}</AppText>
          <StructuredAnswer text={stream.data.answer} />
          {!stream.data.sources.length ? <Notice tone="warning" icon="alert" title="No clause answers this" message="No supporting excerpts were returned, so treat this as unverified. We won’t guess without a source." /> : null}
        </View>
      ) : null}

      <FormError error={stream.error} />

      {suggestions.length && !disabled && !stream.isPending ? (
        <View>
          <AppText variant="eyebrow" tone="muted" style={styles.label}>{asked ? "Ask next" : "Try asking"}</AppText>
          {suggestions.map((suggestion, index) => (
            <Pressable key={suggestion} accessibilityRole="button" onPress={() => send(suggestion)} style={({ pressed }) => [styles.suggestion, index < suggestions.length - 1 && styles.divider, pressed && styles.pressed]}>
              <AppText style={styles.flex}>{suggestion}</AppText>
              <Icon name="arrowUp" size={13} color={colors.faint} />
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.composer}>
        <TextInput
          accessibilityLabel={placeholder}
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          placeholderTextColor={colors.faint}
          editable={!disabled}
          multiline
          maxLength={2000}
          style={styles.input}
        />
        {stream.isPending ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Stop" onPress={stream.cancel} style={styles.send}><Icon name="stop" size={18} color={colors.onPrimary} /></Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="Ask" accessibilityState={{ disabled: !canSend }} disabled={!canSend} onPress={() => send(draft)} style={[styles.send, !canSend && styles.sendOff]}>
            <Icon name="arrowUp" size={18} color={colors.onPrimary} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  stack: { gap: space.xl - 4 },
  block: { gap: space.md },
  label: { marginBottom: space.xs },
  suggestion: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 52, paddingVertical: 13 },
  divider: { borderBottomWidth: 1, borderBottomColor: c.line },
  pressed: { opacity: 0.6 },
  flex: { flex: 1 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: space.sm },
  input: { flex: 1, minHeight: 48, maxHeight: 140, borderRadius: 24, backgroundColor: c.raised, paddingHorizontal: 18, paddingTop: 13, paddingBottom: 13, color: c.ink, fontSize: 16, fontFamily: font.regular },
  send: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" },
  sendOff: { opacity: 0.35 },
}));
