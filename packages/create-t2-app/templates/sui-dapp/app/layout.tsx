import type { Metadata } from "next";
import "@mysten/dapp-kit/dist/index.css";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "sui-dapp — wallet + AI on t2000/auto",
  description:
    "Sui dApp starter: wallet connect, gRPC balance reads, and an AI copilot on the t2000 router.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
