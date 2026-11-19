/** Pure helpers for the recent-search list, kept apart from storage so tests can run in Node. */
export const MAX_RECENT_SEARCHES = 5;

/**
 * Puts `term` first, drops an older copy of it (ignoring case) and keeps the
 * newest five. Terms shorter than two characters are never searched, so they
 * are never kept either.
 */
export function addRecentSearch(list: string[], term: string, max = MAX_RECENT_SEARCHES): string[] {
  const clean = term.trim().replace(/\s+/g, " ");
  if (clean.length < 2) return list;
  const rest = list.filter((item) => item.toLocaleLowerCase() !== clean.toLocaleLowerCase());
  return [clean, ...rest].slice(0, max);
}

/** Reads a stored list, treating anything malformed as empty. */
export function parseRecentSearches(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, MAX_RECENT_SEARCHES) : [];
  } catch {
    return [];
  }
}
