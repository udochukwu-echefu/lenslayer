import { Stack } from "expo-router";
import { useStackOptions } from "@/components/header";

export default function AgreementsStack() {
  const options = useStackOptions();
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={{ title: "Agreements" }} />
    </Stack>
  );
}
