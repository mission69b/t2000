import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Analytics } from "@vercel/analytics/next";
import { totalServices, totalEndpoints } from "@/lib/catalog";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

const SHORT_DESC = `Pay-per-request APIs. ${totalServices()} services, ${totalEndpoints()} endpoints across AI, search, web, voice, and finance. No keys, no accounts. Settled in USDC on Sui.`;
const SOCIAL_DESC = `Pay-per-request APIs. No API keys. Settled in USDC on Sui. Gasless.`;

export const metadata: Metadata = {
  title: "mpp.t2000.ai — pay-per-request APIs on Sui",
  description: SHORT_DESC,
  metadataBase: new URL("https://mpp.t2000.ai"),
  openGraph: {
    title: "mpp.t2000.ai — pay-per-request APIs on Sui",
    description: SOCIAL_DESC,
    siteName: "mpp.t2000.ai",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    site: "@t2000ai",
    title: "mpp.t2000.ai — pay-per-request APIs on Sui",
    description: SOCIAL_DESC,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
