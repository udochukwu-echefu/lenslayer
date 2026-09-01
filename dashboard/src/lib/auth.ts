import type { NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";

const issuer = process.env.AUTH_OIDC_ISSUER ? `${process.env.AUTH_OIDC_ISSUER.replace(/\/$/, "")}/` : undefined;
const issuerBase = issuer?.replace(/\/$/, "");
const clientId = process.env.AUTH_OIDC_CLIENT_ID;
const clientSecret = process.env.AUTH_OIDC_CLIENT_SECRET;
const audience = process.env.AUTH_OIDC_AUDIENCE;

export const oidcConfigured = Boolean(issuer && audience && clientId && clientSecret && process.env.NEXTAUTH_SECRET);

export function safeCallbackUrl(value?: string | string[] | null, fallback = "/") {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate?.startsWith("/")) return fallback;
  try {
    const decoded = decodeURIComponent(candidate);
    if (decoded.startsWith("//") || decoded.includes("\\")) return fallback;
    const parsed = new URL(candidate, "https://lenslayer.invalid");
    return parsed.origin === "https://lenslayer.invalid" ? candidate : fallback;
  } catch {
    return fallback;
  }
}

async function refreshAccessToken(token: JWT): Promise<JWT> {
  if (!issuer || !clientId || !clientSecret || !token.refreshToken) return { ...token, error: "RefreshAccessTokenError" };
  try {
    const response = await fetch(`${issuerBase}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, client_secret: clientSecret, refresh_token: token.refreshToken }),
      cache: "no-store",
    });
    const refreshed = await response.json() as { access_token?: string; expires_in?: number; refresh_token?: string; error?: string };
    if (!response.ok || !refreshed.access_token) throw new Error(refreshed.error ?? `Token refresh failed (${response.status})`);
    return {
      ...token,
      accessToken: refreshed.access_token,
      accessTokenExpires: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch (error) {
    console.error("Auth0 access-token refresh failed", error);
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  providers: oidcConfigured ? [{
    id: "oidc",
    name: process.env.AUTH_OIDC_NAME ?? "Auth0",
    type: "oauth",
    issuer,
    jwks_endpoint: `${issuerBase}/.well-known/jwks.json`,
    clientId,
    clientSecret,
    idToken: true,
    checks: ["pkce", "state"],
    authorization: { url: `${issuerBase}/authorize`, params: { scope: "openid email profile offline_access", ...(audience ? { audience } : {}) } },
    token: { url: `${issuerBase}/oauth/token` },
    userinfo: { url: `${issuerBase}/userinfo` },
    profile(profile) {
      return {
        id: String(profile.sub),
        name: String(profile.name ?? profile.preferred_username ?? profile.email ?? "LensLayer user"),
        email: String(profile.email ?? ""),
      };
    },
  }] : [],
  pages: { signIn: "/signin", error: "/auth/error", signOut: "/auth/signout" },
  callbacks: {
    async jwt({ token, account }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
        token.accessTokenExpires = (account.expires_at ?? Math.floor(Date.now() / 1000) + 3600) * 1000;
        token.refreshToken = account.refresh_token ?? token.refreshToken;
        token.error = undefined;
        return token;
      }
      if (!token.accessTokenExpires || Date.now() < token.accessTokenExpires - 60_000) return token;
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.accessToken = typeof token.accessToken === "string" ? token.accessToken : undefined;
      session.error = token.error;
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
};
