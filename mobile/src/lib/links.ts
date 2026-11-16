import type { Href } from "expo-router";

/**
 * Notifications carry web paths such as "/contracts/<id>?tab=risks" or
 * "/tasks". This maps them onto the app's routes so a tap lands on the same
 * place. Unknown paths fall back to the inbox, like the dashboard.
 */
export function routeForWebPath(webPath: string | null | undefined): Href {
  if (!webPath) return "/inbox";
  let url: URL;
  try { url = new URL(webPath, "https://lenslayer.invalid"); } catch { return "/inbox"; }
  const parts = url.pathname.split("/").filter(Boolean);
  const tab = url.searchParams.get("tab") ?? undefined;
  if (parts[0] === "contracts" && parts[1] && parts[1] !== "new") return { pathname: "/contract/[id]", params: tab ? { id: parts[1], tab } : { id: parts[1] } };
  if (parts[0] === "contracts" && parts[1] === "new") return "/new/contract";
  if (parts[0] === "contracts") return "/contracts";
  if (parts[0] === "tasks") return "/renewals/tasks";
  if (parts[0] === "calendar") return "/renewals";
  if (parts[0] === "portfolio") return "/ask";
  if (parts[0] === "reports") return "/reports";
  if (parts[0] === "notifications") return "/notifications";
  if (parts[0] === "team") return "/settings/team";
  if (parts[0] === "settings" && parts[1]) return { pathname: "/settings/[section]", params: { section: parts[1] } };
  if (parts[0] === "settings") return "/settings";
  if (parts[0] === "invite" && parts[1]) return { pathname: "/invite/[token]", params: { token: parts[1] } };
  return "/inbox";
}
