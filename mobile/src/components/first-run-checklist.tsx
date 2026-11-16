import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { View } from "react-native";
import { api } from "@/lib/api";
import { useMembers } from "@/lib/queries";
import { ErrorState, ListRow, Loading, Section } from "./ui";

/** Gets a new workspace ready using the records the team already owns. */
export function FirstRunChecklist({ organizationId, uploaded }: { organizationId: string; uploaded: boolean }) {
  const members = useMembers(organizationId);
  const invitations = useQuery({ queryKey: ["invitations", organizationId], queryFn: () => api.invitations(organizationId), enabled: Boolean(organizationId) });
  const invited = (members.data?.length ?? 0) > 1 || Boolean(invitations.data?.some((item) => item.status === "pending"));
  if (invited && uploaded) return null;

  const error = members.error ?? invitations.error;
  const loading = members.isLoading || invitations.isLoading;

  return (
    <Section title="Get started" description={error || loading ? undefined : `${Number(invited) + Number(uploaded)} of 2 steps complete`}>
      {error ? <ErrorState error={error} onRetry={() => void Promise.all([members.refetch(), invitations.refetch()])} />
        : loading ? <Loading rows={2} />
        : (
          <View>
            <ListRow icon={invited ? "check" : "people"} title="Invite your team" subtitle={invited ? "Complete" : "Review agreements together."}
              onPress={invited ? undefined : () => router.push("/new/invitation")} />
            <ListRow icon={uploaded ? "check" : "upload"} title="Upload your first agreement" subtitle={uploaded ? "Complete" : "Start a review for risks, obligations and dates."}
              onPress={uploaded ? undefined : () => router.push("/new/contract")} last />
          </View>
        )}
    </Section>
  );
}
