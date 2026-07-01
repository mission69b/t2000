import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Verify — confidential AI, proven on Sui",
  description:
    "Every confidential (GPU-TEE) inference on Audric is anchored on Sui. A public, privacy-safe feed of verified responses — check any receipt yourself.",
  metadataBase: new URL("https://verify.t2000.ai"),
  openGraph: {
    title: "Verify — confidential AI, proven on Sui",
    description:
      "Every confidential inference anchored on Sui. Hashes only — no prompts, no identities. Verify any receipt yourself.",
    siteName: "t2000 · Verify",
    type: "website",
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
