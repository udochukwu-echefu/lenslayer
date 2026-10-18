import { InvitationProviders } from "@/components/providers";
import "@/app/public.css";

export default function InvitationLayout({ children }: { children: React.ReactNode }) {
  return <InvitationProviders>{children}</InvitationProviders>;
}
