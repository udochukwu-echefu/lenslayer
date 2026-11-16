import { Stack } from "expo-router";
import { useStackOptions } from "@/components/header";

export default function OverviewStack() {
  const options = useStackOptions();
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={{ title: "Today" }} />
      <Stack.Screen name="inbox" options={{ title: "Inbox" }} />
      <Stack.Screen name="reports" options={{ title: "Reports" }} />
    </Stack>
  );
}
