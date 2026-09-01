import { NextResponse } from "next/server";

function clearSessionCookies(request: Request, response: NextResponse) {
  const names = new Set(["next-auth.session-token", "__Secure-next-auth.session-token"]);
  for (const entry of (request.headers.get("cookie") ?? "").split(";")) {
    const name = entry.trim().split("=", 1)[0];
    if (name.startsWith("next-auth.session-token.") || name.startsWith("__Secure-next-auth.session-token.")) names.add(name);
  }
  for (const name of names) response.cookies.set(name, "", { expires: new Date(0), httpOnly: true, path: "/", sameSite: "lax", secure: name.startsWith("__Secure-") });
  return response;
}

export function GET(request: Request) {
  const appOrigin = process.env.NEXTAUTH_URL ?? new URL(request.url).origin;
  const signedOutUrl = new URL("/auth/signed-out", appOrigin);
  const issuer = process.env.AUTH_OIDC_ISSUER?.replace(/\/$/, "");
  const clientId = process.env.AUTH_OIDC_CLIENT_ID;

  if (!issuer || !clientId) return clearSessionCookies(request, NextResponse.redirect(signedOutUrl));

  const logoutUrl = new URL(`${issuer}/v2/logout`);
  logoutUrl.searchParams.set("client_id", clientId);
  logoutUrl.searchParams.set("returnTo", signedOutUrl.toString());
  return clearSessionCookies(request, NextResponse.redirect(logoutUrl));
}
