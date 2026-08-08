import type { NextAuthOptions } from "next-auth";

const issuer = process.env.AUTH_OIDC_ISSUER?.replace(/\/$/, "");
const clientId = process.env.AUTH_OIDC_CLIENT_ID;
const clientSecret = process.env.AUTH_OIDC_CLIENT_SECRET;

export const oidcConfigured = Boolean(issuer && clientId && clientSecret && process.env.NEXTAUTH_SECRET);

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  providers: oidcConfigured ? [{
    id: "oidc",
    name: process.env.AUTH_OIDC_NAME ?? "Company SSO",
    type: "oauth",
    wellKnown: `${issuer}/.well-known/openid-configuration`,
    clientId,
    clientSecret,
    idToken: true,
    checks: ["pkce", "state"],
    authorization: { params: { scope: "openid email profile" } },
    profile(profile) {
      return {
        id: String(profile.sub),
        name: String(profile.name ?? profile.preferred_username ?? profile.email ?? "Lenslayer user"),
        email: String(profile.email ?? ""),
      };
    },
  }] : [],
  pages: { signIn: "/signin", error: "/auth/error", signOut: "/auth/signout" },
  callbacks: {
    async jwt({ token, account }) {
      if (account?.access_token) token.accessToken = account.access_token;
      return token;
    },
    async session({ session, token }) {
      session.accessToken = typeof token.accessToken === "string" ? token.accessToken : undefined;
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
};
