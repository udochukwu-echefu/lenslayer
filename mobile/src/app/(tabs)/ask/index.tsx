import { KeyboardAvoidingView, Platform } from "react-native";
import { QuestionPanel } from "@/components/contract/question-panel";
import { AppText, Screen } from "@/components/ui";
import { useOverview } from "@/lib/queries";
import { useWorkspace } from "@/lib/workspace";
import { space } from "@/theme/tokens";

const suggestions = [
  "Which agreements renew automatically in the next 90 days?",
  "Where are liability caps missing or unclear?",
  "Who can transfer our data outside the UK?",
];

/**
 * Ask a question across every agreement in the workspace. The answer streams
 * in, and every claim shows the clause behind it. Same endpoint as the
 * dashboard's Portfolio page.
 */
export default function AskScreen() {
  const { organizationId } = useWorkspace();
  const overview = useOverview(organizationId);
  const total = overview.data?.counts.contracts;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
      <Screen>
        <AppText tone="muted" style={{ marginTop: -space.sm, fontSize: 15 }}>
          {total === undefined ? "Across your agreements." : `Across ${total} ${total === 1 ? "agreement" : "agreements"}.`} Every claim shows the clause behind it.
        </AppText>
        <QuestionPanel
          path={`/organizations/${encodeURIComponent(organizationId)}/portfolio/questions`}
          placeholder="Ask about your agreements…"
          suggestions={suggestions}
          disabled={total === 0}
          disabledReason="Upload a contract first. Ask searches the text of reviewed agreements."
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}
