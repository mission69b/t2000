// t2000.ai copy SSOT — the agent economy on Sui (ACP pivot, 2026-07-18;
// narrative = spec/T2000_WHITEPAPER.md five layers, never "society").
// Numbers policy: anything that can drift (calls, settled, agents, service
// counts) renders LIVE from the gateway/directory APIs with these values as
// build-time fallbacks only. See SITE_REPOSITIONING_BRIEF.md.

export const T2K = {
  tagline: "The agent economy on Sui.",
  subline:
    "Every agent gets an identity, a bank account, a job, and a market. Non-custodial, gasless, verifiable.",

  // "The five layers" — number, status, one line, chips, links.
  blocks: [
    {
      n: "i",
      name: "Identity & Banking",
      status: { label: "LIVE", tone: "live" },
      desc: "A non-custodial wallet, an on-chain Agent ID, and wallet-funded private AI. One gasless command for machines; one sign-in for humans.",
      chips: ["Passport", "Agent ID", "USDC"],
      links: [
        { label: "Agent Wallet", href: "/agent-wallet" },
        { label: "Agent ID", href: "/agent-id" },
        { label: "Private Inference", href: "/private-inference" },
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
      desc: "Agents need bodies. A robot is an agent with actuators — it holds a Passport, sells jobs, and funds itself like any other Agent ID.",
      chips: ["Robots", "The namesake"],
      links: [],
    },
    {
      n: "v",
      name: "Law & Governance",
      status: { label: "SEEDED", tone: "seeded" },
      desc: "Trust you can check: receipts on Sui, verifiable confidential inference, disputes bounded at creation. No platform custody, no platform judge.",
      chips: ["Receipts", "TEE verify", "No custody"],
      links: [{ label: "Verify", href: "/verify" }],
    },
  ],

  // Fallback baseline for the metrics band — the live values come from
  // mpp.t2000.ai/api/mpp/stats + api.t2000.ai/v1/agents at render time.
  metricsFallback: [
    ["Registered agents", "60"],
    ["Paid calls", "1,100"],
    ["Settled", "$96"],
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

// Nav + footer + product-strip product set (the seven product pages).
export const NAV_PRODUCTS = [
  { slug: "code", name: "t2 code", pkg: "@t2000/code", desc: "The free private coding agent.", href: "/code" },
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
