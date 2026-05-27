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

export const metadata: Metadata = {
  title: "t2000 — Agentic finance infrastructure on Sui",
  description:
    "Build agents that move money. Wallet, payments, SDK, and engine — gasless on Sui.",
  metadataBase: new URL("https://t2000.ai"),
  openGraph: {
    title: "t2000 — Agentic finance infrastructure on Sui",
    description:
      "Build agents that move money. Wallet, payments, SDK, and engine — gasless on Sui.",
    siteName: "t2000",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    site: "@t2000ai",
    title: "t2000 — Agentic finance infrastructure on Sui",
    description:
      "Build agents that move money. Wallet, payments, SDK, and engine — gasless on Sui.",
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
