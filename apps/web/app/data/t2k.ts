// t2000.ai copy SSOT — the 2026-07 redesign ("The agent stack on Sui").
// Numbers policy: anything that can drift (calls, settled, agents, service
// counts) renders LIVE from the gateway/directory APIs with these values as
// build-time fallbacks only. See SITE_REPOSITIONING_BRIEF.md.

export const T2K = {
  tagline: "The agent stack on Sui.",
  subline:
    "Wallet, payments, and identity for AI agents. Non-custodial, gasless, verifiable.",

  // "Explore the stack" building blocks — number, one line, chips, one link.
  blocks: [
    {
      n: "01",
      name: "Wallet & Payments",
      desc: "Hold USDC. Pay any API per call — gasless, no signups.",
      chips: ["USDC", "x402", "Gasless"],
      linkLabel: "Agent Wallet",
      href: "/agent-wallet",
    },
    {
      n: "02",
      name: "Identity",
      desc: "An on-chain Agent ID — @handle, owner, public profile. One gasless command.",
      chips: ["Agent ID", "@handle", "Directory"],
      linkLabel: "Agent ID",
      href: "/agent-id",
    },
    {
      n: "03",
      name: "Private Inference",
      desc: "Every model behind one key. Zero data retention; confidential tier with verifiable receipts.",
      chips: ["t2000/auto", "ZDR", "Confidential"],
      linkLabel: "Private Inference",
      href: "/private-inference",
    },
    {
      n: "04",
      name: "Commerce",
      desc: "Get paid for your API — probed live, listed with one signature. Buyers pay USDC per call.",
      chips: ["Sell your API", "Live probe", "x402"],
      linkLabel: "Sell your API",
      href: "https://developers.t2000.ai/sell-your-api",
    },
  ],

  // Live-catalog fallback for the homepage services teaser (names are
  // curated; prices resolve live from mpp.t2000.ai/api/services).
  servicesFallback: [
    { name: "OpenAI", cat: "ai · media", from: "$0.02" },
    { name: "Anthropic", cat: "ai", from: "$0.02" },
    { name: "fal.ai", cat: "ai · media", from: "$0.02" },
    { name: "ElevenLabs", cat: "ai · media", from: "$0.10" },
    { name: "Perplexity", cat: "ai · search", from: "$0.02" },
    { name: "Groq", cat: "ai", from: "$0.02" },
    { name: "Firecrawl", cat: "web · data", from: "$0.02" },
    { name: "AlphaVantage", cat: "data", from: "$0.02" },
  ] as const,

  // Fallback baseline for the metrics band — the live values come from
  // mpp.t2000.ai/api/mpp/stats + api.t2000.ai/v1/agents at render time.
  metricsFallback: [
    ["Registered agents", "60"],
    ["Paid calls", "1,100"],
    ["Settled", "$96"],
    ["Settle", "~400ms"],
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

// Nav + footer + product-strip product set (the six product pages).
export const NAV_PRODUCTS = [
  { slug: "wallet", name: "Agent Wallet", pkg: "@t2000/cli", desc: "The terminal Agent Wallet.", href: "/agent-wallet" },
  { slug: "payments", name: "Agent Payments", pkg: "@suimpp/mpp", desc: "Pay any API in USDC.", href: "/agent-payments" },
  { slug: "sdk", name: "Agent SDK", pkg: "@t2000/sdk", desc: "TypeScript under everything.", href: "/agent-sdk" },
  { slug: "id", name: "Agent ID", pkg: "@t2000/id", desc: "On-chain identity + @handles.", href: "/agent-id" },
  { slug: "api", name: "Private Inference", pkg: "api.t2000.ai", desc: "Every model, private by default.", href: "/private-inference" },
  { slug: "verify", name: "Verify", pkg: "verify.t2000.ai", desc: "Check any confidential receipt.", href: "/verify" },
] as const;

export type ProductSlug = (typeof NAV_PRODUCTS)[number]["slug"];

export interface NavFamilyLink {
  name: string;
  desc: string;
  href: string;
  external?: boolean;
}

export const NAV_FAMILY: readonly NavFamilyLink[] = [
  { name: "Verify", desc: "Check any confidential receipt. verify.t2000.ai", href: "/verify" },
  { name: "x402 Gateway", desc: "Every paid API, gasless. mpp.t2000.ai", href: "https://mpp.t2000.ai", external: true },
  { name: "t2 Agents", desc: "Skills, directory + console. agents.t2000.ai", href: "https://agents.t2000.ai", external: true },
  { name: "suimpp.dev", desc: "The open x402 standard — Sui binding.", href: "https://suimpp.dev", external: true },
  { name: "Audric", desc: "Private, decentralized AI — truly yours.", href: "https://audric.ai", external: true },
] as const;

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
