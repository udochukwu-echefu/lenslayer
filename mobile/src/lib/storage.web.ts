/**
 * Browser preview storage. Refresh tokens are kept in sessionStorage so they
 * do not outlive the tab; everything else uses localStorage.
 */
const sessionOnly = new Set(["lenslayer.auth.refreshToken"]);

function store(key: string): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return sessionOnly.has(key) ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

export const storage = {
  async get(key: string): Promise<string | null> {
    try { return store(key)?.getItem(key) ?? null; } catch { return null; }
  },
  async set(key: string, value: string): Promise<void> {
    try { store(key)?.setItem(key, value); } catch { /* in-memory state still works */ }
  },
  async remove(key: string): Promise<void> {
    try { store(key)?.removeItem(key); } catch { /* nothing to clear */ }
  },
};

export const storageKeys = {
  refreshToken: "lenslayer.auth.refreshToken",
  localIdentity: "lenslayer.auth.localIdentity",
  activeOrganization: "lenslayer.activeOrganization",
  themePreference: "lenslayer.themePreference",
  /** Followed by the workspace id, so one workspace never shows another's searches. */
  recentSearches: "lenslayer.recentSearches.",
  biometricLock: "lenslayer.biometricLock",
} as const;
