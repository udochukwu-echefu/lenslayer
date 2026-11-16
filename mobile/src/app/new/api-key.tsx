import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { FormScreen } from "@/components/form-screen";
import { OneTimeSecret } from "@/components/one-time-secret";
import { AppText, CheckRow, TextField } from "@/components/ui";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";

/** Create an API key for a script or integration. Give it only the access it needs. */
export default function NewApiKeyScreen() {
  const { organizationId } = useWorkspace();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [read, setRead] = useState(true);
  const [write, setWrite] = useState(false);
  const create = useMutation({
    mutationFn: () => api.createApiKey(organizationId, { name: name.trim(), scopes: [...(read ? ["contracts:read"] : []), ...(write ? ["contracts:write"] : [])] }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys", organizationId] }),
  });
  if (create.data) {
    return <OneTimeSecret title="Copy your key now" description={`“${create.data.api_key.name}” is ready.`} value={create.data.token}
      warning="This is the only time it’s shown. Store it in your password manager or secrets vault, never in chat or email." />;
  }
  return (
    <FormScreen submitLabel="Create key" onSubmit={() => create.mutate()} disabled={name.trim().length < 2 || (!read && !write)} loading={create.isPending} error={create.error} needsEditor={false}>
      <TextField label="Name" value={name} onChangeText={setName} maxLength={120} autoFocus placeholder="e.g. Board pack export" help="Say where it’s used, so you know what breaks if you revoke it." />
      <View>
        <AppText variant="smallStrong" tone="muted">It can</AppText>
        <CheckRow label="Read contracts and reviews" checked={read} onChange={setRead} />
        <CheckRow label="Upload contracts" checked={write} onChange={setWrite} />
      </View>
    </FormScreen>
  );
}
