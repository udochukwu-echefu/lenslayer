import * as SecureStore from "expo-secure-store";

/**
 * Small key/value persistence. Native uses the Keychain/Keystore through
 * SecureStore; `storage.web.ts` replaces this module in the browser.
 * Every call is best-effort: a failed read behaves like an empty store.
 */
export const storage = {
  async get(key: string): Promise<string | null> {
    try { return await SecureStore.getItemAsync(key); } catch { return null; }
  },
  async set(key: string, value: string): Promise<void> {
    try { await SecureStore.setItemAsync(key, value); } catch { /* in-memory state still works */ }
  },
  async remove(key: string): Promise<void> {
    try { await SecureStore.deleteItemAsync(key); } catch { /* nothing to clear */ }
  },
};

export const storageKeys = {
  refreshToken: "lenslayer.auth.refreshToken",
  localIdentity: "lenslayer.auth.localIdentity",
  activeOrganization: "lenslayer.activeOrganization",
  themePreference: "lenslayer.themePreference",
} as const;
