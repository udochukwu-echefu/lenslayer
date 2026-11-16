/**
 * Build-time configuration. EXPO_PUBLIC_* values are inlined by Metro, so a
 * change needs a restart of `expo start`. See mobile/.env.example.
 */
const read = (value: string | undefined) => value?.trim() || "";

const apiUrl = read(process.env.EXPO_PUBLIC_LENSLAYER_API_URL) || "http://127.0.0.1:8000";
const issuer = read(process.env.EXPO_PUBLIC_AUTH_OIDC_ISSUER).replace(/\/$/, "");
const clientId = read(process.env.EXPO_PUBLIC_AUTH_OIDC_CLIENT_ID);
const audience = read(process.env.EXPO_PUBLIC_AUTH_OIDC_AUDIENCE);
const requestedMode = read(process.env.EXPO_PUBLIC_LENSLAYER_AUTH_MODE);

export const config = {
  /** FastAPI origin, without /api/v1. */
  apiUrl: apiUrl.replace(/\/$/, ""),
  apiPrefix: `${apiUrl.replace(/\/$/, "")}/api/v1`,
  /** Public web workspace, used for share and invitation links. */
  webUrl: (read(process.env.EXPO_PUBLIC_LENSLAYER_WEB_URL) || "http://localhost:3000").replace(/\/$/, ""),
  oidc: {
    issuer,
    clientId,
    audience,
    emailConnection: read(process.env.EXPO_PUBLIC_AUTH_OIDC_EMAIL_CONNECTION) || "Username-Password-Authentication",
    configured: Boolean(issuer && clientId && audience),
  },
  /**
   * "local" sends the backend's development identity headers and only works
   * against LENSLAYER_PLATFORM_AUTH_MODE=local. It is refused in release builds.
   */
  authMode: (requestedMode === "local" && __DEV__ ? "local" : "oidc") as "local" | "oidc",
} as const;
