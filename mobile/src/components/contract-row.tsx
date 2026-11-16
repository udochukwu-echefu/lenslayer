import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { reviewJobProgress } from "@/lib/format";
import type { Contract } from "@/lib/shared/types";
import { createStyles } from "@/theme/create-styles";
import { space } from "@/theme/tokens";
import { AppText, StatusBadge } from "./ui";

/**
 * One agreement in a list: the title, then a single line with the review
 * status and the counterparty. Tapping opens the contract review.
 */
export function ContractRow({ contract, last }: { contract: Contract; last?: boolean }) {
  const styles = useStyles();
  const moving = ["queued", "processing", "running"].includes(contract.status);
  const detail = moving ? reviewJobProgress(contract.latest_job) : contract.counterparty || contract.contract_type || "";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${contract.title || contract.source_name}, ${contract.status}`}
      onPress={() => router.push({ pathname: "/contract/[id]", params: { id: contract.id } })}
      style={({ pressed }) => [styles.row, !last && styles.divider, pressed && styles.pressed]}
    >
      <AppText variant="bodyStrong" numberOfLines={2}>{contract.title || contract.source_name}</AppText>
      <View style={styles.meta}>
        <StatusBadge status={contract.status} />
        {detail ? <AppText variant="small" tone="muted" numberOfLines={1} style={styles.detail}>{detail}</AppText> : null}
      </View>
    </Pressable>
  );
}

export function ContractList({ contracts }: { contracts: Contract[] }) {
  return <View>{contracts.map((contract, index) => <ContractRow key={contract.id} contract={contract} last={index === contracts.length - 1} />)}</View>;
}

const useStyles = createStyles((c) => ({
  row: { gap: 3, paddingVertical: 13, minHeight: 58, justifyContent: "center" },
  divider: { borderBottomWidth: 1, borderBottomColor: c.line },
  pressed: { opacity: 0.6 },
  meta: { flexDirection: "row", alignItems: "center", gap: space.sm + 2 },
  detail: { flexShrink: 1 },
}));
