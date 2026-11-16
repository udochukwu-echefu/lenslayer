import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Pressable, Share, View } from "react-native";
import { api } from "@/lib/api";
import { config } from "@/lib/config";
import { formatDate } from "@/lib/format";
import { useWorkspace } from "@/lib/workspace";
import { space } from "@/theme/tokens";
import { AppText, Button, Chips, FormError, ListRow, Notice, Segmented, Sheet, TextField, ToggleRow } from "../ui";

type Days = "1" | "3" | "7" | "30";
type Format = "pdf" | "docx" | "csv" | "md";

/**
 * Everything that leaves the workspace, in one sheet: a secure review link
 * for outside counsel (expires, can be revoked), file exports, the counsel
 * handoff pack and the Word redline. Files open the system share sheet.
 */
export function ShareSheet({ contractId, title, visible, onClose }: { contractId: string; title: string; visible: boolean; onClose: () => void }) {
  const { organizationId, canUpload } = useWorkspace();
  const queryClient = useQueryClient();
  const key = ["shares", organizationId, contractId];
  const shares = useQuery({ queryKey: key, queryFn: () => api.shares(organizationId, contractId), enabled: Boolean(organizationId) && visible && canUpload });
  const [format, setFormat] = useState<Format>("pdf");
  const [label, setLabel] = useState("");
  const [evidence, setEvidence] = useState(true);
  const [days, setDays] = useState<Days>("7");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [now] = useState(() => Date.now());
  const exportFile = useMutation({ mutationFn: () => api.downloadContractExport(organizationId, contractId, format) });
  const handoff = useMutation({ mutationFn: () => api.downloadCounselHandoff(organizationId, contractId) });
  const redline = useMutation({ mutationFn: () => api.downloadRedline(organizationId, contractId) });
  const create = useMutation({
    mutationFn: () => api.createShare(organizationId, contractId, { label: label.trim(), include_evidence: evidence, expires_in_days: Number(days) as 1 | 3 | 7 | 30 }),
    onSuccess: (created) => { setLink(`${config.webUrl}/shared/${created.token}`); setLabel(""); return queryClient.invalidateQueries({ queryKey: key }); },
  });
  const revoke = useMutation({ mutationFn: (id: string) => api.revokeShare(organizationId, contractId, id), onSuccess: () => queryClient.invalidateQueries({ queryKey: key }) });
  const active = (shares.data ?? []).filter((share) => !share.revoked_at && new Date(share.expires_at).getTime() > now);

  return (
    <Sheet title={`Share ${title}`} visible={visible} onClose={onClose} action={{ label: "Done", onPress: onClose }}>
      <View>
        <AppText variant="eyebrow" tone="muted">Export the review</AppText>
        <View style={{ gap: space.md, marginTop: space.sm }}>
          <Chips label="Export format" value={format} onChange={setFormat} options={[{ value: "pdf", label: "PDF" }, { value: "docx", label: "Word" }, { value: "csv", label: "CSV" }, { value: "md", label: "Markdown" }]} />
          <Button label={`Export ${format === "docx" ? "Word" : format.toUpperCase()}`} icon="share" variant="secondary" loading={exportFile.isPending} onPress={() => exportFile.mutate()} />
        </View>
        <ListRow icon="document" title="Counsel handoff package" subtitle="Word file: evidence, open risks, decisions" onPress={() => handoff.mutate()} />
        <ListRow icon="pencil" title="Word redline" subtitle="Suggested wording as tracked changes" onPress={() => redline.mutate()} last />
        <FormError error={exportFile.error ?? handoff.error ?? redline.error} />
      </View>

      {canUpload ? (
        <View style={{ gap: space.md }}>
          <AppText variant="eyebrow" tone="muted">Secure review link</AppText>
          {link ? (
            <Notice icon="link" title="Link ready, copy it now" message="For security, the full link is shown only once.">
              <AppText variant="mono" selectable numberOfLines={2}>{link}</AppText>
              <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.xs }}>
                <Button label={copied ? "Copied" : "Copy link"} compact onPress={async () => { await Clipboard.setStringAsync(link); setCopied(true); }} />
                <Button label="Share…" variant="secondary" compact onPress={() => void Share.share({ message: link })} />
              </View>
            </Notice>
          ) : null}
          <TextField label="Label" value={label} onChangeText={setLabel} placeholder="e.g. Outside counsel" maxLength={120} help="Shows the review report without workspace access." />
          <ToggleRow label="Include source excerpts" help="Quoted clauses next to each finding" value={evidence} onChange={setEvidence} />
          <Segmented label="Link expires after" value={days} onChange={setDays} options={[{ value: "1", label: "1 day" }, { value: "3", label: "3 days" }, { value: "7", label: "7 days" }, { value: "30", label: "30 days" }]} />
          <Button label="Create link" loading={create.isPending} disabled={label.trim().length < 2} onPress={() => create.mutate()} />
          <FormError error={create.error ?? revoke.error} />
          {active.length ? (
            <View>
              <AppText variant="eyebrow" tone="muted">Active links</AppText>
              {active.map((share, index) => (
                <ListRow key={share.id} title={share.label} subtitle={`Expires ${formatDate(share.expires_at, { day: "numeric", month: "short" })} · viewed ${share.view_count} ${share.view_count === 1 ? "time" : "times"}`} last={index === active.length - 1}
                  trailing={<Pressable accessibilityRole="button" hitSlop={10} onPress={() => revoke.mutate(share.id)}><AppText variant="smallStrong" tone="danger">Revoke</AppText></Pressable>} />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}
