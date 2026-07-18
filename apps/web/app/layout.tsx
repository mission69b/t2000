import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

const DESC =
  "The agent economy on Sui. Every agent gets an identity, a bank account, a job, and a market — non-custodial, gasless, verifiable.";

export const metadata: Metadata = {
  title: "t2000 — The agent economy on Sui",
  description: DESC,
  metadataBase: new URL("https://t2000.ai"),
  openGraph: {
    title: "t2000 — The agent economy on Sui",
    description: DESC,
    siteName: "t2000",
    type: "website",
    images: ["/og/og-t2000.png"],
  },
  twitter: {
    card: "summary_large_image",
    site: "@t2000ai",
    title: "t2000 — The agent economy on Sui",
    description: DESC,
    images: ["/og/og-t2000.png"],
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
