import { Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold, useFonts } from "@expo-google-fonts/figtree";
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import { ApiError } from "@/lib/api";
import { AuthProvider, useAuth } from "@/lib/auth";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace";
import { AppThemeProvider, useTheme } from "@/theme/theme-provider";
import { font } from "@/theme/tokens";

/**
 * Root of the app: providers, the root stack, and the sign-in guards.
 *
 *   signed out                     → sign-in
 *   signed in, no usable workspace → workspace-setup (create one / verify email)
 *   signed in with a workspace     → tabs, contract detail, forms
 *
 * invite/[token] sits outside every guard so a link opens whatever the state.
 */
SplashScreen.preventAutoHideAsync();
WebBrowser.maybeCompleteAuthSession();

// Refetch stale data when the app returns to the foreground.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (status) => focusManager.setFocused(status === "active"));
}
onlineManager.setOnline(true);

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (count, error) => !(error instanceof ApiError && [401, 403, 404].includes(error.status)) && count < 2,
      },
    },
  }));
  return (
    <AppThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider queryClient={queryClient}>
          <WorkspaceProvider>
            <Navigator />
          </WorkspaceProvider>
        </AuthProvider>
      </QueryClientProvider>
    </AppThemeProvider>
  );
}

function Navigator() {
  const { status } = useAuth();
  const { organizations, isLoading } = useWorkspace();
  const { colors, scheme } = useTheme();
  // Figtree is the app's typeface. The splash screen stays up until it has loaded,
  // so text never flashes in the system font first.
  const [fontsLoaded, fontError] = useFonts({ Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold });
  const signedIn = status === "signedIn";
  const ready = (fontsLoaded || Boolean(fontError)) && (status === "signedOut" || (signedIn && !isLoading));
  const hasWorkspace = organizations.length > 0;

  useEffect(() => { if (ready) void SplashScreen.hideAsync(); }, [ready]);

  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const navigationTheme = { ...base, colors: { ...base.colors, background: colors.canvas, card: colors.surface, text: colors.ink, border: colors.line, primary: colors.accent } };
  const form = { presentation: "modal" as const, headerShown: true };

  if (!fontsLoaded && !fontError) return null;

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerTintColor: colors.accent, headerTitleStyle: { fontFamily: font.semibold, color: colors.ink }, headerBackTitleStyle: { fontFamily: font.medium }, headerStyle: { backgroundColor: colors.canvas }, contentStyle: { backgroundColor: colors.canvas }, headerShadowVisible: false }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>

        <Stack.Protected guard={signedIn && !hasWorkspace}>
          <Stack.Screen name="workspace-setup" options={{ headerShown: false }} />
        </Stack.Protected>

        <Stack.Protected guard={signedIn && hasWorkspace}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="contract/[id]" options={{ title: "", headerBackTitle: "Back" }} />
          <Stack.Screen name="notifications" options={{ title: "Notifications", headerBackTitle: "Back" }} />
          <Stack.Screen name="search" options={{ title: "Search", headerBackTitle: "Back" }} />
          <Stack.Screen name="new/contract" options={{ ...form, title: "Upload a contract" }} />
          <Stack.Screen name="new/task" options={{ ...form, title: "New action" }} />
          <Stack.Screen name="new/lifecycle" options={{ ...form, title: "Add a date" }} />
          <Stack.Screen name="new/approval" options={{ ...form, title: "Request approval" }} />
          <Stack.Screen name="new/decision" options={{ ...form, title: "Record a decision" }} />
          <Stack.Screen name="new/negotiation-item" options={{ ...form, title: "Negotiation point" }} />
          <Stack.Screen name="new/response" options={{ ...form, title: "Counterparty response" }} />
          <Stack.Screen name="new/version" options={{ ...form, title: "Upload a revision" }} />
          <Stack.Screen name="new/invitation" options={{ ...form, title: "Invite a teammate" }} />
          <Stack.Screen name="new/api-key" options={{ ...form, title: "New API key" }} />
          <Stack.Screen name="new/webhook" options={{ ...form, title: "New webhook" }} />
        </Stack.Protected>

        <Stack.Screen name="invite/[token]" options={{ title: "Invitation", presentation: "modal" }} />
      </Stack>
    </ThemeProvider>
  );
}
