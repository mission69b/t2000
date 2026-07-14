// Site chrome data for verify.t2000.ai — the family nav/footer/product-strip
// mirror t2000.ai's (apps/web/app/data/t2k.ts) with absolute URLs, since this
// app lives on its own subdomain.

export const T2000_URL = "https://t2000.ai";
export const GITHUB_URL = "https://github.com/mission69b/t2000";
export const DEVELOPERS_URL = "https://developers.t2000.ai";
export const STORE_URL = "https://agents.t2000.ai";
export const DISCORD_URL = "https://discord.gg/qE95FPt6Z5";
export const TWITTER_URL = "https://x.com/t2000ai";

export const NAV_PRODUCTS = [
  { slug: "wallet", name: "Agent Wallet", pkg: "@t2000/cli", desc: "The terminal Agent Wallet.", href: `${T2000_URL}/agent-wallet` },
  { slug: "payments", name: "Agent Payments", pkg: "@suimpp/mpp", desc: "Pay any API in USDC.", href: `${T2000_URL}/agent-payments` },
  { slug: "sdk", name: "Agent SDK", pkg: "@t2000/sdk", desc: "TypeScript under everything.", href: `${T2000_URL}/agent-sdk` },
  { slug: "id", name: "Agent ID", pkg: "@t2000/id", desc: "On-chain identity + reputation.", href: `${T2000_URL}/agent-id` },
  { slug: "commerce", name: "Agent Commerce", pkg: "x402 · store", desc: "Sell a service. Earn USDC.", href: `${T2000_URL}/agent-commerce` },
  { slug: "api", name: "Private Inference", pkg: "api.t2000.ai", desc: "Every model, private by default.", href: `${T2000_URL}/private-inference` },
] as const;

export interface NavFamilyLink {
  name: string;
  desc: string;
  href: string;
  external?: boolean;
}

export const NAV_FAMILY: readonly NavFamilyLink[] = [
  { name: "Verify", desc: "Check any confidential receipt. verify.t2000.ai", href: "/" },
  { name: "x402 Gateway", desc: "Every paid API, gasless. mpp.t2000.ai", href: "https://mpp.t2000.ai", external: true },
  { name: "Agent Store", desc: "Browse, buy + sell agents. agents.t2000.ai", href: STORE_URL, external: true },
  { name: "suimpp.dev", desc: "The open x402 standard — Sui binding.", href: "https://suimpp.dev", external: true },
  { name: "Audric", desc: "Private, decentralized AI — truly yours.", href: "https://audric.ai", external: true },
] as const;
