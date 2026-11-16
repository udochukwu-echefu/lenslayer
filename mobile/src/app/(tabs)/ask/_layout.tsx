import { Stack } from "expo-router";
import { useStackOptions } from "@/components/header";

export default function AskStack() {
  const options = useStackOptions();
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={{ title: "Ask" }} />
    </Stack>
  );
}
