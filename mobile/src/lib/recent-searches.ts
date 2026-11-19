import { useCallback, useEffect, useState } from "react";
import { addRecentSearch, parseRecentSearches } from "./recent-search-list";
import { storage, storageKeys } from "./storage";

/**
 * The last few searches in one workspace, kept on this phone only. A search
 * counts once the person acts on it (opens a result, asks, or presses Search),
 * not on every keystroke.
 */
export function useRecentSearches(organizationId: string) {
  const key = `${storageKeys.recentSearches}${organizationId}`;
  const [loaded, setLoaded] = useState<{ key: string; items: string[] }>({ key: "", items: [] });
  const items = loaded.key === key ? loaded.items : [];

  useEffect(() => {
    let active = true;
    void storage.get(key).then((raw) => { if (active) setLoaded({ key, items: parseRecentSearches(raw) }); });
    return () => { active = false; };
  }, [key]);

  const remember = useCallback((term: string) => {
    setLoaded((current) => {
      const next = addRecentSearch(current.key === key ? current.items : [], term);
      void storage.set(key, JSON.stringify(next));
      return { key, items: next };
    });
  }, [key]);

  const clear = useCallback(() => {
    setLoaded({ key, items: [] });
    void storage.remove(key);
  }, [key]);

  return { items, remember, clear };
}
