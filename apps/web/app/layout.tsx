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
  viewportFit: "cover",
  themeColor: "#000000",
};

export const metadata: Metadata = {
  title: "t2000 — The Infrastructure Behind Audric",
  description:
    "The infrastructure behind Audric. CLI, SDK, MCP server, conversational engine, and pay-per-use API gateway. Open source. Non-custodial. Built on Sui.",
  openGraph: {
    title: "t2000 — The Infrastructure Behind Audric",
    description:
      "The infrastructure behind Audric. CLI, SDK, MCP server, conversational engine, and pay-per-use API gateway. Built on Sui.",
    type: "website",
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
      className={`${GeistSans.variable} ${GeistMono.variable} ${instrumentSerif.variable}`}
    >
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
