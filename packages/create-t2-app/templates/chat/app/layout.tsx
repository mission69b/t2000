import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "chat — t2000/auto",
  description: "Streaming AI chat on the t2000 router.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
