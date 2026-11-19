import * as LocalAuthentication from "expo-local-authentication";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { useAuth } from "./auth";
import { storage, storageKeys } from "./storage";

/** How long the app can sit in the background before it asks again. */
const RELOCK_AFTER_MS = 5 * 60_000;

type AppLockValue = {
  /** "Face ID", "Touch ID" or "Fingerprint" when the phone can do it and has one set up; otherwise null. */
  method: string | null;
  enabled: boolean;
  locked: boolean;
  /** False until the saved setting has been read, so the app never flashes open before locking. */
  isRestored: boolean;
  /** Turning it on asks for a scan first, so nobody switches it on without a face or finger enrolled. */
  setEnabled: (on: boolean) => Promise<boolean>;
  unlock: () => Promise<void>;
};

const AppLockContext = createContext<AppLockValue | null>(null);

async function detectMethod(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    if (!(await LocalAuthentication.hasHardwareAsync()) || !(await LocalAuthentication.isEnrolledAsync())) return null;
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return Platform.OS === "ios" ? "Face ID" : "Face unlock";
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return Platform.OS === "ios" ? "Touch ID" : "Fingerprint";
    return null;
  } catch {
    return null;
  }
}

/**
 * Optional Face ID / Touch ID lock, per phone. This guards opening the app,
 * not the account: the session itself still lives in the Keychain, and the
 * phone's passcode is always accepted as a fallback. Signing out turns it off,
 * so the next person to sign in on this phone starts unlocked.
 */
export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const [method, setMethod] = useState<string | null>(null);
  const [enabled, setEnabledState] = useState(false);
  const [locked, setLocked] = useState(false);
  const [isRestored, setIsRestored] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const prompting = useRef(false);

  useEffect(() => {
    let active = true;
    void Promise.all([storage.get(storageKeys.biometricLock), detectMethod()]).then(([saved, found]) => {
      if (!active) return;
      const on = saved === "1" && found !== null;
      setMethod(found);
      setEnabledState(on);
      setLocked(on);
      setIsRestored(true);
    });
    return () => { active = false; };
  }, []);

  // Signing out clears the setting; there is nothing left to protect.
  const [lastStatus, setLastStatus] = useState(status);
  if (status !== lastStatus) {
    setLastStatus(status);
    if (status === "signedOut" && enabled) { setEnabledState(false); setLocked(false); void storage.remove(storageKeys.biometricLock); }
  }

  // Face ID can be set up (or removed) in iOS Settings while the app is open.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void detectMethod().then(setMethod);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "background") backgroundedAt.current = Date.now();
      if (next === "active" && backgroundedAt.current !== null) {
        if (Date.now() - backgroundedAt.current > RELOCK_AFTER_MS) setLocked(true);
        backgroundedAt.current = null;
      }
    });
    return () => subscription.remove();
  }, [enabled]);

  const authenticate = useCallback(async (promptMessage: string) => {
    if (prompting.current) return false;
    prompting.current = true;
    try {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage, fallbackLabel: "Use passcode", cancelLabel: "Cancel" });
      return result.success;
    } catch {
      return false;
    } finally {
      prompting.current = false;
    }
  }, []);

  const unlock = useCallback(async () => {
    if (await authenticate("Unlock LensLayer")) setLocked(false);
  }, [authenticate]);

  const setEnabled = useCallback(async (on: boolean) => {
    if (on) {
      const found = await detectMethod();
      setMethod(found);
      if (!found || !(await authenticate(`Turn on ${found} for LensLayer`))) return false;
      await storage.set(storageKeys.biometricLock, "1");
    } else {
      await storage.remove(storageKeys.biometricLock);
    }
    setEnabledState(on);
    return true;
  }, [authenticate]);

  const value = useMemo<AppLockValue>(() => ({
    method,
    enabled,
    locked: locked && enabled && status === "signedIn",
    isRestored,
    setEnabled,
    unlock,
  }), [enabled, isRestored, locked, method, setEnabled, status, unlock]);

  return <AppLockContext value={value}>{children}</AppLockContext>;
}

export function useAppLock() {
  const value = use(AppLockContext);
  if (!value) throw new Error("useAppLock must be used inside AppLockProvider");
  return value;
}
