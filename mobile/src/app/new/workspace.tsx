import { router } from "expo-router";
import { useState } from "react";
import { FormScreen } from "@/components/form-screen";
import { PageIntro, TextField } from "@/components/ui";
import { useCreateWorkspace } from "@/lib/workspace";

/** Lets a signed-in user create and switch to a separate workspace. */
export default function NewWorkspaceScreen() {
  const [name, setName] = useState("");
  const create = useCreateWorkspace();

  return (
    <FormScreen submitLabel="Create workspace" needsEditor={false} disabled={name.trim().length < 2}
      loading={create.isPending} error={create.error}
      onSubmit={() => create.mutate(name, { onSuccess: () => router.dismissTo("/") })}>
      <PageIntro title="Name your workspace" description="A workspace holds your team’s agreements, reviews and renewal dates. Most teams use their company or department name." />
      <TextField label="Workspace name" value={name} onChangeText={setName} maxLength={255} placeholder="e.g. Acme legal" help="You can change this later in Settings." />
    </FormScreen>
  );
}
