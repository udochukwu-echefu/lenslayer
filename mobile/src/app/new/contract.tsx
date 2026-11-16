import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { FormScreen } from "@/components/form-screen";
import { AppText, CheckRow, Icon, ListRow, Section, Segmented, Select, TextField, ToggleRow } from "@/components/ui";
import { api } from "@/lib/api";
import { MAX_UPLOAD_BYTES, pickDocument, type PickedDocument } from "@/lib/files";
import { fileSize } from "@/lib/format";
import { invalidateWorkspaceRecords } from "@/lib/queries";
import { useWorkspace } from "@/lib/workspace";
import { createStyles } from "@/theme/create-styles";
import { radius, space } from "@/theme/tokens";

const option = (value: string) => ({ value, label: value });
const types = ["Unknown", "Services", "Employment", "Lease", "NDA", "Supplier", "Loan", "Partnership", "Other"].map(option);
const roles = ["Not sure / general review", "Customer / buyer", "Vendor / supplier", "Employer", "Employee / contractor", "Landlord", "Tenant", "Borrower", "Lender"].map(option);
const goals = ["Understand before signing", "Prepare to negotiate", "Check an existing agreement", "Summarise obligations", "Compare with our position"].map(option);
const postures = ["Conservative", "Balanced", "Commercially flexible"].map(option);
type Days = "7" | "30" | "90" | "365";

/**
 * Upload a contract for a first-pass review. The form posts the same fields as
 * the web upload page (multipart form data), so both produce identical reviews.
 * Who you are reviewing for changes what counts as a risk, so it is asked
 * before analysis, not after.
 */
export default function NewContractScreen() {
  const styles = useStyles();
  const { organizationId } = useWorkspace();
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["organization-settings", organizationId], queryFn: () => api.organizationSettings(organizationId), enabled: Boolean(organizationId) });
  const [file, setFile] = useState<PickedDocument | null>(null);
  const [fileError, setFileError] = useState("");
  const [title, setTitle] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [type, setType] = useState("Unknown");
  const [role, setRole] = useState(roles[0].value);
  const [goal, setGoal] = useState(goals[0].value);
  const [posture, setPosture] = useState("Balanced");
  const [law, setLaw] = useState("");
  const [keepFile, setKeepFile] = useState<boolean | null>(null);
  const [keepText, setKeepText] = useState<boolean | null>(null);
  const [days, setDays] = useState<Days | null>(null);
  const [authorised, setAuthorised] = useState(false);
  const retainFile = keepFile ?? settings.data?.default_retain_document ?? true;
  const retainText = keepText ?? settings.data?.default_retain_source_text ?? true;
  const retention = days ?? (String(settings.data?.default_retention_days ?? 30) as Days);

  async function choose() {
    setFileError("");
    try {
      const picked = await pickDocument();
      if (!picked) return;
      if (picked.size > MAX_UPLOAD_BYTES) return setFileError("The document must be 25 MB or smaller.");
      setFile(picked);
      if (!title) setTitle(picked.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
    } catch (cause) {
      setFileError(cause instanceof Error ? cause.message : "That file couldn’t be opened.");
    }
  }

  const upload = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("file", file!.blob, file!.name);
      form.append("title", title.trim());
      form.append("counterparty", counterparty.trim());
      form.append("contract_type", type);
      form.append("party_role", role);
      form.append("goal", goal);
      form.append("risk_tolerance", posture);
      form.append("jurisdiction", law.trim());
      form.append("retention_days", retention);
      // Same as an HTML checkbox: the field is sent only when it is on.
      if (retainFile) form.append("retain_document", "true");
      if (retainText) form.append("retain_source_text", "true");
      return api.createContract(organizationId, form);
    },
    onSuccess: async ({ contract }) => {
      await invalidateWorkspaceRecords(queryClient, organizationId, "contracts");
      router.replace({ pathname: "/contract/[id]", params: { id: contract.id } });
    },
  });

  return (
    <FormScreen submitLabel="Start review" onSubmit={() => upload.mutate()} disabled={!file || title.trim().length < 2 || !authorised} loading={upload.isPending} error={upload.error ?? (fileError ? new Error(fileError) : null)}
      footnote="One original document per review. Upload revisions to the contract later.">
      {file ? (
        <ListRow icon="document" title={file.name} subtitle={fileSize(file.size)} last trailing={<Pressable accessibilityRole="button" hitSlop={10} onPress={() => void choose()}><AppText variant="smallStrong" tone="accent">Change</AppText></Pressable>} />
      ) : (
        <Pressable accessibilityRole="button" onPress={() => void choose()} style={styles.drop}>
          <Icon name="upload" size={24} />
          <AppText variant="bodyStrong">Choose from Files</AppText>
          <AppText variant="small" tone="muted" style={styles.center}>PDF, Word or text, up to 25 MB. Includes iCloud, Google Drive, OneDrive and Dropbox.</AppText>
        </Pressable>
      )}

      <TextField label="Contract title" value={title} onChangeText={setTitle} maxLength={255} placeholder="e.g. Northwind logistics MSA" />
      <TextField label="Counterparty" value={counterparty} onChangeText={setCounterparty} maxLength={255} placeholder="The other party" />
      <Select label="Type" value={type} options={types} onChange={setType} />

      <Section title="Review it for">
        <View style={styles.stack}>
          <Select label="Your side" value={role} options={roles} onChange={setRole} />
          <Select label="Goal" value={goal} options={goals} onChange={setGoal} />
          <Select label="Risk posture" value={posture} options={postures} onChange={setPosture} />
          <TextField label="Governing law (optional)" value={law} onChangeText={setLaw} placeholder="e.g. England and Wales" maxLength={120} />
        </View>
      </Section>

      <Section title="Keep only what you need">
        <View>
          <ToggleRow label="Keep the original file" help="For downloads and reprocessing later" value={retainFile} onChange={setKeepFile} />
          <ToggleRow label="Keep the extracted text" help="Needed to ask questions about this contract" value={retainText} onChange={setKeepText} />
        </View>
        <AppText variant="smallStrong" tone="muted" style={styles.label}>Delete automatically after</AppText>
        <Segmented label="Retention period" value={retention} onChange={setDays} options={[{ value: "7", label: "7 days" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }, { value: "365", label: "1 year" }]} />
        <AppText variant="caption" tone="faint" style={styles.note}>The review report stays until you delete it.</AppText>
      </Section>

      <CheckRow label="I’m authorised to process this document." checked={authorised} onChange={setAuthorised} />
    </FormScreen>
  );
}

const useStyles = createStyles((c) => ({
  drop: { alignItems: "center", gap: space.sm, padding: space.xl, borderRadius: radius.lg, backgroundColor: c.raised },
  center: { textAlign: "center" },
  stack: { gap: space.lg, marginTop: space.sm },
  label: { marginTop: space.lg, marginBottom: space.sm },
  note: { marginTop: space.sm },
}));
