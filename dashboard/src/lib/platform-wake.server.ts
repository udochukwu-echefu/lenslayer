import { after } from "next/server";

/**
 * The API scales to zero and takes ~10s to start cold (plus ~2s for Neon to
 * resume). Starting it while someone is on Auth0's sign-in page hides that wait
 * behind the login instead of their first click. Best effort: never awaited.
 */
export function wakePlatformApi() {
  const base = process.env.PLATFORM_API_URL?.replace(/\/$/, "");
  if (!base) return;
  after(() => fetch(`${base}/health/ready`, { cache: "no-store", signal: AbortSignal.timeout(20_000) })
    .then(() => undefined, () => undefined));
}
