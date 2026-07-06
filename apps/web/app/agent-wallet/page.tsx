import type { Metadata } from "next";

import { Nav } from "../components/site/Nav";
import { ProductStrip } from "../components/site/ProductStrip";
import { SiteFooter } from "../components/site/SiteFooter";
import { WalletCloser } from "../components/wallet/WalletCloser";
import { WalletCommandSurface } from "../components/wallet/WalletCommandSurface";
import { WalletHero } from "../components/wallet/WalletHero";
import { WalletSurfaces } from "../components/wallet/WalletSurfaces";
import { WalletTrust } from "../components/wallet/WalletTrust";

const DESC =
  "The terminal Agent Wallet. Gasless USDC + USDsui sends, Cetus swaps, x402 paid API access. Plus MCP for Claude Desktop, Cursor, Windsurf.";

export const metadata: Metadata = {
  title: "Agent Wallet — t2000",
  description: DESC,
  openGraph: {
    title: "Agent Wallet — t2000",
    description:
      "Send. Swap. Pay any API. Your agent's wallet — run it from your terminal or wire it into Claude Desktop.",
    url: "https://t2000.ai/agent-wallet",
    type: "website",
    images: ["/og/og-wallet.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Agent Wallet — t2000",
    description: DESC,
    images: ["/og/og-wallet.png"],
  },
};

export default function AgentWalletPage() {
  return (
    <>
      <Nav currentPage="wallet" />
      <main>
        <WalletHero />
        <WalletCommandSurface />
        <WalletSurfaces />
        <WalletTrust />
        <ProductStrip currentPage="wallet" />
        <WalletCloser />
      </main>
      <SiteFooter />
    </>
  );
}
