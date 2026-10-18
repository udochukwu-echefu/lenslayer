/** Server-only by Next's next/headers boundary. Never export this through the browser API barrel. */
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import type { NextAuthOptions, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";

export type TrustedSession = { subject: string; sessionId: string; accessToken: string };

function trustedToken(token: JWT): TrustedSession | null {
  if (token.error || typeof token.sub !== "string" || typeof token.accessToken !== "string" ||
      typeof token.browserSessionId !== "string" || !/^[0-9a-f-]{36}$/.test(token.browserSessionId) ||
      !token.accessTokenExpires || token.accessTokenExpires <= Date.now()) return null;
  return { subject: token.sub, sessionId: token.browserSessionId, accessToken: token.accessToken };
}

// Only private route layouts call this. One verified, read-only session provides
// both a browser-safe projection and credentials for request-local API reads.
export async function readPrivateWorkspaceSession(): Promise<{ session: Session | null | undefined; trusted: TrustedSession | null }> {
  if (!(await headers()).get("cookie")) return { session: null, trusted: null };
  let trusted: TrustedSession | null = null;
  let browserExpires = "";
  let needsRefresh = false;
  const options: NextAuthOptions = { ...authOptions, callbacks: { ...authOptions.callbacks,
    // RSC cookies are read-only. A rotating grant must only refresh where its
    // replacement can be persisted by the session route or authenticated BFF.
    async jwt({ token }) { return token; },
    async session({ session, token }) {
      needsRefresh = !token.accessTokenExpires || token.accessTokenExpires <= Date.now() + 60_000;
      trusted = trustedToken(token);
      const expires = typeof token.exp === "number" ? new Date(token.exp * 1000).toISOString() : session.expires;
      browserExpires = expires;
      return { expires, ...(token.error ? { error: token.error } : {}),
        user: { id: token.sub, name: session.user?.name, email: session.user?.email, image: session.user?.image } };
    },
  } };
  const session = await getServerSession(options);
  if (session && needsRefresh) return { session: undefined, trusted: null };
  // NextAuth v4 strips expires in RSCs (read-only cookies). Keep the verified
  // JWT's original hard expiry, never a newly invented sliding browser expiry.
  return { session: session ? { ...session, expires: browserExpires } : null, trusted };
}

export function trustedSessionMutationAllowed(request: Request) {
  try {
    const origin = new URL(process.env.NEXTAUTH_URL ?? "").origin;
    return new URL(request.url).origin === origin && request.headers.get("origin") === origin &&
      request.headers.get("x-lenslayer-platform-csrf") === "1" &&
      (!request.headers.has("sec-fetch-site") || request.headers.get("sec-fetch-site") === "same-origin");
  } catch { return false; }
}

export async function readTrustedSession(): Promise<TrustedSession | null> {
  if (!(await headers()).get("cookie")) return null;
  // Runs the JWT refresh callback and persists rotation through NextAuth. This
  // PRIVATE projection is used only inside the BFF, never /api/auth/session.
  const session = await getServerSession({ ...authOptions, callbacks: { ...authOptions.callbacks,
    async session({ token }) {
      return trustedToken(token) as never;
    },
  } }) as unknown as TrustedSession | null;
  return session;
}
