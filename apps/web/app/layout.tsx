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
  title: "t2000 — The Infrastructure Behind Audric",
  description:
    "The infrastructure behind Audric. CLI, SDK, MCP server, conversational engine, and pay-per-use API gateway. Open source. Non-custodial. Built on Sui.",
  metadataBase: new URL("https://t2000.ai"),
  openGraph: {
    title: "t2000 — The Infrastructure Behind Audric",
    description:
      "The infrastructure behind Audric. CLI, SDK, MCP server, conversational engine, and pay-per-use API gateway. Built on Sui.",
    siteName: "t2000",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    site: "@t2000_ai",
    title: "t2000 — The Infrastructure Behind Audric",
    description:
      "CLI, SDK, MCP server, conversational engine, and pay-per-use API gateway. Built on Sui.",
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
