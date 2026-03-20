import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#040406",
};

export const metadata: Metadata = {
  title: "t2000 MPP Gateway — Sui USDC",
  description:
    "MPP-enabled APIs payable with Sui USDC. OpenAI, Anthropic, fal.ai, and Firecrawl — no API keys, no accounts, just pay.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={ibmPlexMono.variable}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
