import { PublicQueryProvider } from "@/components/public-query-provider";
import "@/app/public.css";

export default function SharedLayout({ children }: { children: React.ReactNode }) {
  return <PublicQueryProvider>{children}</PublicQueryProvider>;
}
