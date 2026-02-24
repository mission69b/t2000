import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Inter } from "next/font/google";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "t2000 — The First Wallet for AI Agents",
  description:
    "Send, save, swap, and borrow on Sui — in one line of code. TypeScript SDK and CLI for AI agent wallets.",
  openGraph: {
    title: "t2000 — The First Wallet for AI Agents",
    description: "Send, save, swap, and borrow on Sui — in one line of code.",
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
        className={`${geistSans.variable} ${inter.variable} ${jetbrainsMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
