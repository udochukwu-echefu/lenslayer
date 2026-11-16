import type { QueryClient } from "@tanstack/react-query";
import {
  AuthRequest, exchangeCodeAsync, fetchDiscoveryAsync, makeRedirectUri, refreshAsync, revokeAsync,
  type DiscoveryDocument, type TokenResponse,
} from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { configureTransport } from "./api/client";
import { config } from "./config";
import { storage, storageKeys } from "./storage";

/**
 * Sign-in state for the whole app.
 *
 * OIDC (Auth0) uses the authorization-code flow with PKCE, the standard for
 * apps that cannot keep a client secret (RFC 8252). The refresh token is kept
 * in SecureStore; the access token only ever lives in memory and is refreshed
 * a minute before it expires. "local" mode sends the backend's development
 * identity headers and exists only in development builds (see config.ts).
 */
export type LocalIdentity = { id: string; email: string; name: string };
type Session =
  | { kind: "oidc"; accessToken: string; expiresAt: number; refreshToken?: string }
  | { kind: "local"; identity: LocalIdentity };
export type AuthStatus = "restoring" | "signedOut" | "signedIn";

type AuthValue = {
  status: AuthStatus;
  mode: "local" | "oidc";
  /** Set when a previous session ended without the user signing out. */
  notice: string | null;
  signIn: (options?: { signUp?: boolean }) => Promise<void>;
  signInLocally: (identity: LocalIdentity) => Promise<void>;
  signOut: () => Promise<void>;
  /** Forces a fresh login, e.g. after verifying an email address. */
  reauthenticate: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);
const redirectUri = makeRedirectUri({ scheme: "lenslayer", path: "auth" });
const scopes = ["openid", "email", "profile", "offline_access"];
const REFRESH_MARGIN_MS = 60_000;

export const defaultLocalIdentity: LocalIdentity = { id: "local-reviewer", email: "reviewer@lenslayer.local", name: "Local Reviewer" };

let discoveryPromise: Promise<DiscoveryDocument> | null = null;
function discovery() {
  discoveryPromise ??= fetchDiscoveryAsync(config.oidc.issuer).catch((error) => { discoveryPromise = null; throw error; });
  return discoveryPromise;
}

function fromTokens(tokens: TokenResponse, previousRefresh?: string): Session {
  const lifetime = (tokens.expiresIn ?? 3600) * 1000;
  return { kind: "oidc", accessToken: tokens.accessToken, expiresAt: Date.now() + lifetime, refreshToken: tokens.refreshToken ?? previousRefresh };
}

export function AuthProvider({ children, queryClient }: { children: React.ReactNode; queryClient: QueryClient }) {
  const [status, setStatus] = useState<AuthStatus>("restoring");
  const [notice, setNotice] = useState<string | null>(null);
  const session = useRef<Session | null>(null);
  const refreshing = useRef<Promise<Session | null> | null>(null);

  const clear = useCallback(async (message: string | null) => {
    session.current = null;
    refreshing.current = null;
    await Promise.all([storage.remove(storageKeys.refreshToken), storage.remove(storageKeys.localIdentity)]);
    queryClient.clear();
    setNotice(message);
    setStatus("signedOut");
  }, [queryClient]);

  const accept = useCallback(async (next: Session) => {
    session.current = next;
    if (next.kind === "oidc" && next.refreshToken) await storage.set(storageKeys.refreshToken, next.refreshToken);
    if (next.kind === "local") await storage.set(storageKeys.localIdentity, JSON.stringify(next.identity));
    setNotice(null);
    setStatus("signedIn");
  }, []);

  /** One refresh at a time: parallel requests share the same promise. */
  const refresh = useCallback((refreshToken: string) => {
    refreshing.current ??= (async () => {
      try {
        const tokens = await refreshAsync({ clientId: config.oidc.clientId, refreshToken, scopes }, await discovery());
        const next = fromTokens(tokens, refreshToken);
        await accept(next);
        return next;
      } catch {
        await clear("Your session ended. Sign in again to continue.");
        return null;
      } finally {
        refreshing.current = null;
      }
    })();
    return refreshing.current;
  }, [accept, clear]);

  const headers = useCallback(async (): Promise<Record<string, string> | null> => {
    let current = session.current;
    if (!current) return null;
    if (current.kind === "local") {
      return { "X-LensLayer-User": current.identity.id, "X-LensLayer-Email": current.identity.email, "X-LensLayer-Name": current.identity.name };
    }
    if (Date.now() > current.expiresAt - REFRESH_MARGIN_MS) {
      if (!current.refreshToken) { await clear("Your session ended. Sign in again to continue."); return null; }
      current = await refresh(current.refreshToken);
      if (!current || current.kind !== "oidc") return null;
    }
    return { Authorization: `Bearer ${current.accessToken}` };
  }, [clear, refresh]);

  useEffect(() => {
    configureTransport({
      headers,
      onUnauthorized: () => { if (session.current) void clear("Your session ended. Sign in again to continue."); },
    });
  }, [clear, headers]);

  // Restore a previous session on launch.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (config.authMode === "local") {
        const saved = await storage.get(storageKeys.localIdentity);
        if (cancelled) return;
        if (saved) {
          try { await accept({ kind: "local", identity: JSON.parse(saved) as LocalIdentity }); return; } catch { /* fall through */ }
        }
        setStatus("signedOut");
        return;
      }
      const refreshToken = config.oidc.configured ? await storage.get(storageKeys.refreshToken) : null;
      if (cancelled) return;
      if (!refreshToken) { setStatus("signedOut"); return; }
      await refresh(refreshToken);
    })();
    return () => { cancelled = true; };
  }, [accept, refresh]);

  const authorize = useCallback(async (extraParams: Record<string, string>) => {
    if (!config.oidc.configured) throw new Error("Sign-in isn't configured for this build. Set the EXPO_PUBLIC_AUTH_OIDC_* values in mobile/.env.");
    const document = await discovery();
    const request = new AuthRequest({
      clientId: config.oidc.clientId,
      redirectUri,
      scopes,
      usePKCE: true,
      extraParams: { audience: config.oidc.audience, ...extraParams },
    });
    const result = await request.promptAsync(document);
    if (result.type === "cancel" || result.type === "dismiss") return;
    if (result.type !== "success") {
      const description = result.type === "error" ? result.params.error_description || result.error?.message : "";
      throw new Error(description || "Sign-in did not complete. Try again.");
    }
    const tokens = await exchangeCodeAsync({
      clientId: config.oidc.clientId,
      code: result.params.code,
      redirectUri,
      extraParams: request.codeVerifier ? { code_verifier: request.codeVerifier } : undefined,
    }, document);
    await accept(fromTokens(tokens));
  }, [accept]);

  const value = useMemo<AuthValue>(() => ({
    status,
    mode: config.authMode,
    notice,
    signIn: ({ signUp } = {}) => authorize(signUp ? { screen_hint: "signup" } : {}),
    signInLocally: (identity) => accept({ kind: "local", identity }),
    reauthenticate: () => authorize({ prompt: "login" }),
    signOut: async () => {
      const current = session.current;
      await clear(null);
      if (current?.kind !== "oidc") return;
      try {
        const document = await discovery();
        if (current.refreshToken && document.revocationEndpoint) {
          await revokeAsync({ clientId: config.oidc.clientId, token: current.refreshToken }, document).catch(() => false);
        }
        // Ends the identity provider's browser session so the next sign-in can pick another account.
        const logout = `${config.oidc.issuer}/v2/logout?client_id=${encodeURIComponent(config.oidc.clientId)}&returnTo=${encodeURIComponent(redirectUri)}`;
        await WebBrowser.openAuthSessionAsync(logout, redirectUri);
      } catch { /* local session is already gone */ }
    },
  }), [accept, authorize, clear, notice, status]);

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const value = use(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
