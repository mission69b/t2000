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
  "Wallet, payments, identity, and commerce for AI agents. Non-custodial, gasless, verifiable.";

export const metadata: Metadata = {
  title: "t2000 — The agent stack on Sui",
  description: DESC,
  metadataBase: new URL("https://t2000.ai"),
  openGraph: {
    title: "t2000 — The agent stack on Sui",
    description: DESC,
    siteName: "t2000",
    type: "website",
    images: ["/og/og-t2000.png"],
  },
  twitter: {
    card: "summary_large_image",
    site: "@t2000ai",
    title: "t2000 — The agent stack on Sui",
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
