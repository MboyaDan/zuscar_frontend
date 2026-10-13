import type { Metadata } from "next";
import "@fontsource-variable/outfit";
import "@fontsource-variable/inter";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";
import { EnvBanner } from "@/components/EnvBanner";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: { default: "Zuscar", template: "%s | Zuscar" },
  description: "Zuscar hospitality operations",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <EnvBanner />
        {children}
      </body>
    </html>
  );
}
