const CANONICAL_APP_URL = "https://app.lenslayer.online"

export function resolveAppUrl(configuredUrl, production = true) {
  // Deployment variables must never redirect production visitors to another app.
  if (production || !configuredUrl?.trim()) return CANONICAL_APP_URL

  try {
    const url = new URL(configuredUrl.trim())
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      return CANONICAL_APP_URL
    }
    return url.href.replace(/\/+$/, "")
  } catch {
    return CANONICAL_APP_URL
  }
}
