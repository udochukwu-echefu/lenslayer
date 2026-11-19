/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { addRecentSearch, parseRecentSearches } from "../src/lib/recent-search-list.ts";

test("newest search goes first and repeats move up instead of duplicating", () => {
  let list: string[] = [];
  list = addRecentSearch(list, "liability cap");
  list = addRecentSearch(list, "Kestrel");
  list = addRecentSearch(list, "  LIABILITY   cap ");
  assert.deepEqual(list, ["LIABILITY cap", "Kestrel"]);
});

test("keeps at most five and ignores one-letter searches", () => {
  let list: string[] = [];
  for (const term of ["aa", "bb", "cc", "dd", "ee", "ff", "x"]) list = addRecentSearch(list, term);
  assert.deepEqual(list, ["ff", "ee", "dd", "cc", "bb"]);
});

test("a damaged stored value reads as an empty list", () => {
  assert.deepEqual(parseRecentSearches(null), []);
  assert.deepEqual(parseRecentSearches("{oops"), []);
  assert.deepEqual(parseRecentSearches(JSON.stringify({ a: 1 })), []);
  assert.deepEqual(parseRecentSearches(JSON.stringify(["a", 2, "b"])), ["a", "b"]);
});
