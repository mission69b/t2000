import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Instrument_Serif } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

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
  themeColor: "#040406",
};

export const metadata: Metadata = {
  title: "t2000 — A Bank Account for AI Agents",
  description:
    "A bank account for AI agents. Five accounts — checking, savings, credit, swap, trade. Built on Sui.",
  openGraph: {
    title: "t2000 — A Bank Account for AI Agents",
    description:
      "A bank account for AI agents. Five accounts — checking, savings, credit, swap, trade. Built on Sui.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${ibmPlexMono.variable} ${instrumentSerif.variable}`}
      >
        {children}
        <Analytics />
      </body>
    </html>
  );
}
