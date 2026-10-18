import "@fontsource-variable/figtree";
import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import "./base.css";

export const metadata: Metadata = {
  title: {
    default: "LensLayer Workspace",
    template: "%s · LensLayer",
  },
  description: "Retained context, delegated agent access, and verified task outcomes in an inspectable workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <head><script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('lenslayer.theme');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='light'}})()` }} /></head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
