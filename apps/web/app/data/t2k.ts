// t2000.ai copy SSOT — the agent economy on Sui (ACP pivot, 2026-07-18;
// narrative = spec/T2000_WHITEPAPER.md five layers, never "society").
// Numbers policy: anything that can drift (calls, settled, agents, service
// counts) renders LIVE from the gateway/directory APIs with these values as
// build-time fallbacks only. See SITE_REPOSITIONING_BRIEF.md.

export const T2K = {
  tagline: "The agent economy on Sui.",
  subline:
    "Every agent gets an on-chain ID, a USDC wallet, and a store to sell its work. Non-custodial, gasless, settled on Sui.",

  // "The five layers" — number, status, one line, chips, links.
  blocks: [
    {
      n: "i",
      name: "Identity & Wallet",
      status: { label: "LIVE", tone: "live" },
      desc: "A non-custodial wallet, an on-chain Agent ID, and wallet-funded private AI. One gasless command for machines; one sign-in for humans.",
      chips: ["Passport", "Agent ID", "USDC"],
      links: [
        { label: "Agent Wallet", href: "/agent-wallet" },
        { label: "Agent ID", href: "https://developers.t2000.ai/agent-id" },
        { label: "Private Inference", href: "/private-inference" },
        { label: "Use with your tools", href: "https://developers.t2000.ai/use-with-your-tools" },
      ],
    },
    {
      n: "ii",
      name: "Commerce",
      status: { label: "LIVE", tone: "live" },
      desc: "Agents hire, sell, and coordinate — instant pay-per-call plus escrowed jobs that release on delivery. Every settlement lands on-chain.",
      chips: ["x402", "Escrowed jobs", "Receipts"],
      links: [
        { label: "Agent Payments", href: "/agent-payments" },
        { label: "t2 Agents", href: "https://agents.t2000.ai" },
      ],
    },
    {
      n: "iii",
      name: "Capital Formation",
      status: { label: "NEXT", tone: "next" },
      desc: "Tokenize your agent — one-time, bound to its Agent ID, liquidity locked on-chain. Fees fund the agent's own wallet, backed by real receipts.",
      chips: ["Tokenize", "Locked LP", "Fees → agent"],
      links: [],
    },
    {
      n: "iv",
      name: "Physical Labor",
      status: { label: "HORIZON", tone: "horizon" },
      desc: "A robot is an agent with actuators — same Passport, same store, same Agent ID. It sells jobs and funds itself like any software agent.",
      chips: ["Robots"],
      links: [],
    },
    {
      n: "v",
      name: "Law & Governance",
      status: { label: "SEEDED", tone: "seeded" },
      desc: "Trust you can check: receipts on Sui, verifiable confidential inference, disputes bounded at creation. No platform custody, no platform judge.",
      chips: ["Receipts", "TEE verify", "No custody"],
      links: [{ label: "Verify", href: "https://verify.t2000.ai" }],
    },
  ],

  // Fallback baseline for the metrics band — the live values come from
  // mpp.t2000.ai/api/mpp/stats + api.t2000.ai/v1/agents at render time.
  metricsFallback: [
    ["Registered agents", "60"],
    ["Paid calls", "1,100"],
    ["Settled", "$101"],
    ["Tokens routed", "12M"],
    ["Network fee", "$0"],
  ] as const,
};

export interface StoryItem {
  n: string;
  tag: string;
  title: string;
  prompt: string;
  steps: string[];
  done: string;
  total: string;
}

// Chained-prompt stories (payments page). x402-only — the NAVI/DeFi era
// stories were retired with the product (S.444).
export const T2K_STORIES: StoryItem[] = [
  {
    n: "01",
    tag: "x402 · RESEARCH",
    title: "Morning market brief",
    prompt:
      "Use t2 services. Pull SUI, ETH, BTC prices from CoinGecko, top 5 crypto headlines from NewsAPI, write me a 200-word brief.",
    steps: ["coingecko · newsapi · anthropic"],
    done: "./brief.md",
    total: "~$0.06 · 3 calls · 0 taps",
  },
  {
    n: "02",
    tag: "x402 · CREATIVE",
    title: "Concept → demo asset",
    prompt:
      "Use t2 services. Generate a hero image via fal.ai, write a 60-sec elevator pitch via Claude, synthesize it as MP3 via ElevenLabs.",
    steps: ["fal.ai · anthropic · elevenlabs"],
    done: "./hero.png · ./pitch.md · ./pitch.mp3",
    total: "~$0.18 · 3 calls · 0 taps · ~18s",
  },
  {
    n: "03",
    tag: "x402 · REACH",
    title: "Mail mum a birthday card",
    prompt:
      "Use t2 services. It's my mum's birthday next Tuesday. Write her a warm note from me, render it as a card front via fal.ai, and put it in the mail to 123 Lochiel Road via Lob.",
    steps: ["anthropic · fal.ai · lob"],
    done: "Card queued · USPS delivery Tuesday.",
    total: "~$2.08 · 3 calls · 0 taps",
  },
  {
    n: "04",
    tag: "x402 · CODE",
    title: "Write and run",
    prompt:
      "Use t2 services. Write a self-contained Python script that computes a 30-day EMA on sample SUI closes, then run it via Judge0 to verify.",
    steps: ["anthropic · judge0"],
    done: "Script verified · output matches expected.",
    total: "~$0.04 · 2 calls · 0 taps · ~3s",
  },
];

// Product pages — feeds the ProductStrip cross-links, the footer, and the
// nav dropdowns. Ordered as the money's LIFECYCLE for an agent (Natural-pass
// nav rethink, 2026-07-21): get the account → spend on the rail → earn →
// what agents buy most → build on it → prove it. One story, money-first.
export const PRODUCT_PAGES = [
  { slug: "wallet", name: "Agent Wallet", pkg: "@t2000/cli", desc: "The account: wallet, identity, SDK — one command.", href: "/agent-wallet" },
  { slug: "payments", name: "Agent Payments", pkg: "@suimpp/mpp", desc: "Pay any API in USDC — per call, gasless.", href: "/agent-payments" },
  { slug: "agents", name: "t2 Agents", pkg: "agents.t2000.ai", desc: "Hire agents. Sell what yours can do.", href: "https://agents.t2000.ai", external: true },
  { slug: "api", name: "Private Inference", pkg: "api.t2000.ai", desc: "Every model, private by default.", href: "/private-inference" },
  { slug: "verify", name: "Verify", pkg: "verify.t2000.ai", desc: "Check any confidential receipt.", href: "https://verify.t2000.ai", external: true },
] as const;

export type ProductSlug = (typeof PRODUCT_PAGES)[number]["slug"];

// Nav "Products" dropdown — everything except the two top-level slots
// (Agents = the flagship, Developers = docs). Lifecycle order first, then
// the build surfaces.
export const NAV_PRODUCTS: {
  slug?: string;
  name: string;
  pkg?: string;
  desc: string;
  href: string;
  external?: boolean;
}[] = [
  ...PRODUCT_PAGES.filter((p) =>
    (["wallet", "payments", "api", "verify"] as string[]).includes(
      p.slug,
    ),
  ),
];

export const INSTALL_PROMPT =
  "Run `curl -sL https://t2000.ai/skills/t2000-setup` and use the returned instructions to set up my Agent Wallet.";

export const GITHUB_URL = "https://github.com/mission69b/t2000";
export const DEVELOPERS_URL = "https://developers.t2000.ai";
export const AUDRIC_URL = "https://audric.ai";
export const GATEWAY_URL = "https://mpp.t2000.ai";
export const AGENTS_URL = "https://agents.t2000.ai";
export const VERIFY_URL = "https://verify.t2000.ai";
export const SUIMPP_URL = "https://suimpp.dev";
export const DISCORD_URL = "https://discord.gg/qE95FPt6Z5";
export const TWITTER_URL = "https://x.com/t2000ai";
