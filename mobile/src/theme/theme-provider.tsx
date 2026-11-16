import { createContext, use, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { storage, storageKeys } from "@/lib/storage";
import { darkColors, lightColors, type ColorTokens } from "./tokens";

export type ThemePreference = "system" | "light" | "dark";

type ThemeValue = {
  colors: ColorTokens;
  scheme: "light" | "dark";
  isRestored: boolean;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [storedPreference, setPreferenceState] = useState<ThemePreference | null>(null);
  const preference = storedPreference ?? "system";
  const isRestored = storedPreference !== null;

  useEffect(() => {
    void storage.get(storageKeys.themePreference).then((value) => {
      setPreferenceState((current) => current ?? (value === "light" || value === "dark" ? value : "system"));
    });
  }, []);

  const value = useMemo<ThemeValue>(() => {
    const scheme = preference === "system" ? (system === "dark" ? "dark" : "light") : preference;
    return {
      scheme,
      isRestored,
      colors: scheme === "dark" ? darkColors : lightColors,
      preference,
      setPreference: (next) => {
        setPreferenceState(next);
        void storage.set(storageKeys.themePreference, next);
      },
    };
  }, [isRestored, preference, system]);

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme() {
  const value = use(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside AppThemeProvider");
  return value;
}
