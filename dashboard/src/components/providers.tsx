"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { WorkspaceProvider } from "./workspace-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } },
  }));
  const publicRoute = pathname === "/sample" || pathname === "/signin" || pathname.startsWith("/auth/") || pathname.startsWith("/shared/") || pathname.startsWith("/intake/");
  if (publicRoute) return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return <QueryClientProvider client={client}><WorkspaceProvider>{children}</WorkspaceProvider></QueryClientProvider>;
}
