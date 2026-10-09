"use client";

import { useEffect, useState } from "react";

/** Re-render at an expiry boundary, without a permanent one-second timer. */
export function useBoundaryClock(boundaries: Array<string | null>) {
  const [now, setNow] = useState(Date.now);
  const key = boundaries.filter((value) => value !== null).join("|");
  useEffect(() => {
    const next = Math.min(...key.split("|").map(Date.parse).filter((time) => time > now));
    if (!Number.isFinite(next)) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(2147483647, Math.max(1, next - Date.now() + 1)));
    return () => clearTimeout(timer);
  }, [key, now]);
  return now;
}
