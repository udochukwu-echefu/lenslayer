import { Stack } from "expo-router";
import { useStackOptions } from "@/components/header";

export default function SettingsStack() {
  const options = useStackOptions();
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={{ title: "Settings" }} />
      <Stack.Screen name="[section]" options={{ title: "", headerLargeTitle: false }} />
      <Stack.Screen name="team" options={{ title: "Team" }} />
    </Stack>
  );
}
