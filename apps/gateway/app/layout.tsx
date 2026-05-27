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

const SHORT_DESC = `${totalServices()} services. ${totalEndpoints()} endpoints. Pay-per-request access to AI, search, web, voice, finance APIs. No keys. No accounts. Settled in USDC on Sui.`;
const SOCIAL_DESC = `${totalServices()} services. ${totalEndpoints()} endpoints. No API keys. Settled in USDC on Sui. Gasless.`;

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
    site: "@t2000_ai",
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
