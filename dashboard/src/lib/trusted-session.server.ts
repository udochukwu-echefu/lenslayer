/** Server-only by Next's next/headers boundary. Never export this through the browser API barrel. */
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

export type TrustedSession = { subject: string; sessionId: string; accessToken: string };

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
      if (token.error || typeof token.sub !== "string" || typeof token.accessToken !== "string" ||
          typeof token.browserSessionId !== "string" || !/^[0-9a-f-]{36}$/.test(token.browserSessionId) ||
          !token.accessTokenExpires || token.accessTokenExpires <= Date.now()) return null as never;
      return { subject: token.sub, sessionId: token.browserSessionId, accessToken: token.accessToken } as never;
    },
  } }) as unknown as TrustedSession | null;
  return session;
}
