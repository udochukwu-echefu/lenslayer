import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

export function formatDate(value?: string | null, options?: Intl.DateTimeFormatOptions) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en", options ?? { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function formatRelativeDate(value?: string | null) {
  if (!value) return "Unknown";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "Unknown";
  const days = Math.round((time - Date.now()) / 86_400_000);
  if (Math.abs(days) > 14) return formatDate(value);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(days) >= 1) return formatter.format(days, "day");
  const hours = Math.round((time - Date.now()) / 3_600_000);
  if (Math.abs(hours) >= 1) return formatter.format(hours, "hour");
  return "just now";
}

export function dueAtEndOfDay(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

export function isOverdue(value: string | null | undefined, now: number) {
  const due = dueAtEndOfDay(value);
  return due !== null && due < now;
}

export function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "LL";
}

export function asText(value: unknown, fallback = "Not identified") {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

export function severity(value?: string) {
  const normalized = (value ?? "").toLowerCase();
  if (normalized.includes("high") || normalized.includes("critical")) return "high";
  if (normalized.includes("medium") || normalized.includes("moderate")) return "medium";
  return "low";
}
