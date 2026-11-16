import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { api } from "@/lib/api";
import { formatRelativeDate } from "@/lib/format";
import { useMembers } from "@/lib/queries";
import { useWorkspace } from "@/lib/workspace";
import { createStyles } from "@/theme/create-styles";
import { useTheme } from "@/theme/theme-provider";
import { font, radius, space } from "@/theme/tokens";
import { AppText, Avatar, Chips, EmptyState, ErrorState, FormError, Icon, Loading } from "../ui";

/**
 * The team's conversation about one contract. Mention a teammate to notify
 * them; the chips under the composer pick who.
 */
export function ContractDiscussion({ contractId }: { contractId: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { organizationId, user, canUpload } = useWorkspace();
  const queryClient = useQueryClient();
  const key = ["comments", organizationId, contractId];
  const comments = useQuery({ queryKey: key, queryFn: () => api.comments(organizationId, contractId), enabled: Boolean(organizationId) });
  const members = useMembers(organizationId);
  const [body, setBody] = useState("");
  const [mention, setMention] = useState("none");
  const post = useMutation({
    mutationFn: () => api.createComment(organizationId, contractId, { body: body.trim(), mentioned_user_ids: mention === "none" ? [] : [mention] }),
    onSuccess: () => { setBody(""); setMention("none"); return queryClient.invalidateQueries({ queryKey: key }); },
  });
  const others = (members.data ?? []).filter((member) => member.user_id !== user?.id);
  const canSend = body.trim().length > 0 && !post.isPending;

  return (
    <View style={{ gap: space.lg }}>
      {comments.isLoading ? <Loading rows={3} /> : comments.error ? <ErrorState error={comments.error} onRetry={() => void comments.refetch()} /> : (comments.data ?? []).length ? (
        <View style={styles.thread}>
          {(comments.data ?? []).map((comment) => (
            <View key={comment.id} style={styles.comment}>
              <Avatar name={comment.author_name || comment.author_email} size={34} tint={comment.author_user_id === user?.id ? colors.decisions : undefined} />
              <View style={styles.flex}>
                <AppText variant="smallStrong">{comment.author_name || comment.author_email} <AppText variant="caption" tone="faint">{formatRelativeDate(comment.created_at)}</AppText></AppText>
                <AppText selectable>{comment.body}</AppText>
              </View>
            </View>
          ))}
        </View>
      ) : <EmptyState icon="chat" message="No discussion yet. Add context for a decision or hand a question to a teammate." />}

      {canUpload ? (
        <View style={{ gap: space.md }}>
          {others.length ? (
            <Chips label="Notify a teammate" value={mention} onChange={setMention}
              options={[{ value: "none", label: "Notify no one" }, ...others.slice(0, 8).map((member) => ({ value: member.user_id, label: `@${(member.display_name || member.email).split(/[\s@]/)[0]}` }))]} />
          ) : null}
          <View style={styles.composer}>
            <TextInput accessibilityLabel="Add a comment" value={body} onChangeText={setBody} placeholder="Add context or a handoff note…" placeholderTextColor={colors.faint} multiline maxLength={4000} style={styles.input} />
            <Pressable accessibilityRole="button" accessibilityLabel="Post comment" disabled={!canSend} onPress={() => post.mutate()} style={[styles.send, !canSend && styles.sendOff]}>
              <Icon name="arrowUp" size={18} color={colors.onPrimary} />
            </Pressable>
          </View>
          <FormError error={post.error} />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = createStyles((c) => ({
  thread: { gap: space.lg + 2 },
  comment: { flexDirection: "row", gap: space.md },
  flex: { flex: 1, gap: space.xxs },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: space.sm },
  input: { flex: 1, minHeight: 48, maxHeight: 140, borderRadius: 24, backgroundColor: c.raised, paddingHorizontal: 18, paddingTop: 13, paddingBottom: 13, color: c.ink, fontSize: 16, fontFamily: font.regular },
  send: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" },
  sendOff: { opacity: 0.35 },
}));
