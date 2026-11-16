import { Stack } from "expo-router";
import { useStackOptions } from "@/components/header";

export default function RenewalsStack() {
  const options = useStackOptions();
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={{ title: "Renewals" }} />
      <Stack.Screen name="tasks" options={{ title: "Renewals" }} />
    </Stack>
  );
}
