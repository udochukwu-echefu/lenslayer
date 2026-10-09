import type { Metadata } from "next";
import { DeveloperGuide } from "@/components/agents/developer-guide";

export const metadata: Metadata = { title: "Developer guide", description: "Retain source, delegate scope, run your external client, inspect approval, and verify task creation." };
export default function DevelopersPage() { return <DeveloperGuide />; }
