import { View } from "react-native";
import { space } from "@/theme/tokens";
import { AppText, Button } from "./ui";

/** Footer for paged lists: "Showing 25 of 61" and a button to fetch the next page. */
export function LoadMore({ shown, total, hasNextPage, isFetchingNextPage, fetchNextPage, noun = "items" }: {
  shown: number; total: number; hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown; noun?: string;
}) {
  if (!total) return null;
  return (
    <View style={{ gap: space.sm, alignItems: "flex-start", paddingTop: space.md }}>
      <AppText variant="caption" tone="faint">{`Showing ${shown} of ${total} ${noun}`}</AppText>
      {hasNextPage ? <Button label="Load more" variant="secondary" compact loading={isFetchingNextPage} onPress={() => void fetchNextPage()} /> : null}
    </View>
  );
}
