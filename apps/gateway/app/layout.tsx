import type { Metadata, Viewport } from "next";
import { Instrument_Serif } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
};

export const metadata: Metadata = {
  title: "t2000 MPP Gateway — Sui USDC",
  description:
    "MPP-enabled APIs payable with Sui USDC. OpenAI, Anthropic, fal.ai, and Firecrawl — no API keys, no accounts, just pay.",
  metadataBase: new URL("https://mpp.t2000.ai"),
  openGraph: {
    title: "t2000 MPP Gateway — Pay-per-request APIs on Sui",
    description:
      "No API keys. No accounts. No subscriptions. Your agent pays per request with USDC on Sui.",
    siteName: "t2000 MPP Gateway",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    site: "@t2000ai",
    title: "t2000 MPP Gateway — Pay-per-request APIs on Sui",
    description:
      "No API keys. No accounts. Your agent pays per request with USDC on Sui.",
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
      className={`dark ${GeistSans.variable} ${GeistMono.variable} ${instrumentSerif.variable}`}
    >
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
