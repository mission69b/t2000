// Site chrome data for verify.t2000.ai — the family nav/footer/product-strip
// mirror t2000.ai's (apps/web/app/data/t2k.ts) with absolute URLs, since this
// app lives on its own subdomain.

export const T2000_URL = "https://t2000.ai";
export const GITHUB_URL = "https://github.com/mission69b/t2000";
export const DEVELOPERS_URL = "https://developers.t2000.ai";
export const STORE_URL = "https://t2000.ai";
export const DISCORD_URL = "https://discord.gg/qE95FPt6Z5";
export const TWITTER_URL = "https://x.com/t2000ai";

// Mirrors t2000.ai's NAV_PRODUCTS exactly (t2k.ts PRODUCT_PAGES — the 4 real
// pages; /agent-sdk and /agent-id do NOT exist, SPEC §3 dead-link ban).
// Family cross-links live in the footer, same as t2000.ai.
export const NAV_PRODUCTS = [
  { slug: "wallet", name: "Agent Wallet", pkg: "@t2000/cli", desc: "The account: wallet, identity, SDK — one command.", href: `${T2000_URL}/agent-wallet` },
  { slug: "payments", name: "Agent Payments", pkg: "@suimpp/mpp", desc: "Pay any API in USDC — per call, gasless.", href: `${T2000_URL}/agent-payments` },
  { slug: "api", name: "Private Inference", pkg: "api.t2000.ai", desc: "Every model, private by default.", href: `${T2000_URL}/private-inference` },
  { slug: "verify", name: "Verify", pkg: "verify.t2000.ai", desc: "Check any confidential receipt.", href: "/" },
] as const;
