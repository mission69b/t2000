import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Verify — confidential AI, proven on Sui",
  description:
    "Every confidential (GPU-TEE) inference is anchored on Sui. A public, privacy-safe feed of verified responses — check any receipt yourself.",
  metadataBase: new URL("https://verify.t2000.ai"),
  openGraph: {
    title: "Verify — confidential AI, proven on Sui",
    description:
      "Every confidential inference anchored on Sui. Hashes only — no prompts, no identities. Verify any receipt yourself.",
    siteName: "t2000 · Verify",
    type: "website",
    url: "https://verify.t2000.ai",
    images: ["/og/og-verify.png"],
  },
  twitter: {
    card: "summary_large_image",
    site: "@t2000ai",
    title: "Verify — confidential AI, proven on Sui",
    description:
      "Every confidential inference anchored on Sui. Verify any receipt yourself.",
    images: ["/og/og-verify.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className={`${GeistSans.variable} ${GeistMono.variable}`} lang="en">
      <body>{children}</body>
    </html>
  );
}
