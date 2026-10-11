/** Only non-secret routing metadata survives the provider redirect. */
export const CALENDAR_CONSENT_KEY = "lenslayer.calendarConsent.v1";
export const CALENDAR_CALLBACK_PATH = "/calendar/oauth-return";
const scope = "https://www.googleapis.com/auth/calendar.events.owned";

export type PendingCalendarConsent = { organizationId: string; userId: string; expiresAt: string };
export type CalendarCallback = PendingCalendarConsent & { code: string; state: string };

export function calendarAuthorizationUrl(raw: string, origin: string): string {
  const url = new URL(raw);
  if (url.origin !== "https://accounts.google.com" || url.pathname !== "/o/oauth2/v2/auth" ||
      url.username || url.password || url.hash || url.searchParams.get("scope") !== scope ||
      url.searchParams.get("redirect_uri") !== `${origin}${CALENDAR_CALLBACK_PATH}` || !url.searchParams.get("state")) {
    throw new Error("calendar_redirect_configuration");
  }
  return url.toString();
}

export function takeCalendarCallback(url: URL, history: Pick<History, "replaceState">, storage: Pick<Storage, "getItem" | "removeItem">, now = Date.now()): CalendarCallback | null {
  // Scrub before auth/workspace loading, and never persist code or signed state.
  history.replaceState(null, "", url.pathname);
  const pending = storage.getItem(CALENDAR_CONSENT_KEY);
  storage.removeItem(CALENDAR_CONSENT_KEY);
  const codes = url.searchParams.getAll("code"), states = url.searchParams.getAll("state");
  if (url.searchParams.has("error") || codes.length !== 1 || states.length !== 1 ||
      !codes[0] || !states[0] || codes[0].length > 4096 || states[0].length > 4096 || !pending) return null;
  try {
    const data = JSON.parse(pending) as PendingCalendarConsent;
    if (typeof data.organizationId !== "string" || typeof data.userId !== "string" ||
        !/^[A-Za-z0-9_-]{1,64}$/.test(data.organizationId) || !/^[A-Za-z0-9_-]{1,64}$/.test(data.userId) ||
        typeof data.expiresAt !== "string" || !Number.isFinite(Date.parse(data.expiresAt)) || Date.parse(data.expiresAt) <= now) return null;
    return { organizationId: data.organizationId, userId: data.userId, expiresAt: data.expiresAt, code: codes[0], state: states[0] };
  } catch { return null; }
}
