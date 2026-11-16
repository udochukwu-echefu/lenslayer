import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable } from "react-native";
import { FormScreen } from "@/components/form-screen";
import { AppText, Icon, ListRow, TextField } from "@/components/ui";
import { api } from "@/lib/api";
import { MAX_UPLOAD_BYTES, pickDocument, type PickedDocument } from "@/lib/files";
import { fileSize } from "@/lib/format";
import { useWorkspace } from "@/lib/workspace";
import { createStyles } from "@/theme/create-styles";
import { radius, space } from "@/theme/tokens";

/** Upload a revised draft. LensLayer compares it with the previous version and lists what was added and removed. */
export default function NewVersionScreen() {
  const styles = useStyles();
  const { contractId } = useLocalSearchParams<{ contractId: string }>();
  const { organizationId } = useWorkspace();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<PickedDocument | null>(null);
  const [fileError, setFileError] = useState("");
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");

  async function choose() {
    setFileError("");
    try {
      const picked = await pickDocument();
      if (!picked) return;
      if (picked.size > MAX_UPLOAD_BYTES) return setFileError("The document must be 25 MB or smaller.");
      setFile(picked);
    } catch (cause) {
      setFileError(cause instanceof Error ? cause.message : "That file couldn’t be opened.");
    }
  }

  const upload = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("file", file!.blob, file!.name);
      form.append("label", label.trim());
      form.append("notes", notes.trim());
      return api.uploadVersion(organizationId, contractId, form);
    },
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["versions", organizationId, contractId] }), queryClient.invalidateQueries({ queryKey: ["deal-passport", organizationId, contractId] })]);
      router.back();
    },
  });

  return (
    <FormScreen submitLabel="Upload revision" onSubmit={() => upload.mutate()} disabled={!file} loading={upload.isPending} error={upload.error ?? (fileError ? new Error(fileError) : null)}>
      {file ? (
        <ListRow icon="document" title={file.name} subtitle={fileSize(file.size)} last trailing={<Pressable accessibilityRole="button" hitSlop={10} onPress={() => void choose()}><AppText variant="smallStrong" tone="accent">Change</AppText></Pressable>} />
      ) : (
        <Pressable accessibilityRole="button" onPress={() => void choose()} style={styles.drop}>
          <Icon name="upload" size={24} />
          <AppText variant="bodyStrong">Choose the revised document</AppText>
          <AppText variant="small" tone="muted">PDF, Word or text, up to 25 MB</AppText>
        </Pressable>
      )}
      <TextField label="Label (optional)" value={label} onChangeText={setLabel} maxLength={120} placeholder="e.g. Counterparty markup" />
      <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline maxLength={2000} placeholder="Who sent it and what changed" />
    </FormScreen>
  );
}

const useStyles = createStyles((c) => ({
  drop: { alignItems: "center", gap: space.sm, padding: space.xl, borderRadius: radius.lg, backgroundColor: c.raised },
}));
