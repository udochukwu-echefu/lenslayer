import type { Metadata } from "next";
import { CalendarConsentReturn } from "@/components/calendar-consent-return";

export const metadata: Metadata = { title: "Calendar consent", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default function CalendarOAuthReturnPage() { return <CalendarConsentReturn />; }
