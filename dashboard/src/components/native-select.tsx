"use client";

/** @deprecated Prefer AppSelect with explicit options/onValueChange.
 * Kept as an import alias only; it never opens a visible native menu and does
 * not fabricate native ChangeEvents or infer scope from arbitrary children. */
export { AppSelect as NativeSelect } from "./app-select";
