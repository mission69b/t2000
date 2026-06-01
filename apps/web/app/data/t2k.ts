export const T2K = {
  tagline: "Agentic finance infrastructure on Sui.",
  subline:
    "Four packages. One stack. Everything an AI agent needs to hold a wallet, move USDC, pay APIs, and ship.",

  products: [
    {
      slug: "wallet",
      name: "Agent Wallet",
      pkg: "@t2000/cli",
      one: "The terminal Agent Wallet.",
      desc: "Gasless USDC + USDsui sends, Cetus swaps, MPP paid API access. MCP server for Claude Desktop · Cursor · Windsurf.",
      verbs: ["t2 init", "t2 send 5 USDC alice.sui", "t2 mcp install"],
      href: "/agent-wallet",
    },
    {
      slug: "payments",
      name: "Agent Payments",
      pkg: "@suimpp/mpp · mppx",
      one: "Pay any API in USDC.",
      desc: "Every major AI + data API. Gasless on Sui. No signup, no API keys. Live gateway at mpp.t2000.ai.",
      verbs: ["t2 pay mpp.t2000.ai/openai/...", "t2 services search"],
      href: "/agent-payments",
    },
    {
      slug: "sdk",
      name: "Agent SDK",
      pkg: "@t2000/sdk",
      one: "TypeScript SDK underneath everything.",
      desc: "One class. Wallet signing, gasless transfers, Cetus routing, MPP, NAVI lending builders. Powers Audric.",
      verbs: ["import { T2000 }", "await t.send({ to, amount })", "await t.pay({ url })"],
      href: "/agent-sdk",
    },
    {
      slug: "engine",
      name: "Agent Engine",
      pkg: "@t2000/engine",
      one: "The engine behind Audric.",
      desc: "AISDKEngine. 26 financial tools. 12 safety guards. Silent intelligence. Powers conversational finance.",
      verbs: ["AISDKEngine", "26 tools · 12 guards", "powers audric.ai"],
      href: "/agent-engine",
    },
  ] as const,

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

  metrics: [
    ["Packages", "4"],
    ["Endpoints", "88"],
    ["Services", "40"],
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

export const T2K_STORIES: StoryItem[] = [
  {
    n: "01",
    tag: "AUDRIC · CHAIN",
    title: "Park yield and pay the team",
    prompt: "Swap 10% of my SUI to USDsui, save it to NAVI, then send $10 USDC to alice.sui.",
    steps: ["swap → save → send · bundled in one Payment Intent"],
    done: "Earning ~5.2% APY · $10 sent.",
    total: "~$0.30 fees · 1 tap · ~10s",
  },
  {
    n: "02",
    tag: "AUDRIC · COMPOUND",
    title: "Compound my rewards",
    prompt:
      "Claim my NAVI rewards, swap each non-USDC reward to USDC, deposit the merged USDC back into savings.",
    steps: ["harvest → swap × N → save · one Payment Intent"],
    done: "Rewards compounded back into savings.",
    total: "~10bps × swaps · 1 tap · ~12s",
  },
  {
    n: "03",
    tag: "MPP · RESEARCH",
    title: "Morning market brief",
    prompt:
      "Use t2 services. Pull SUI, ETH, BTC prices from CoinGecko, top 5 crypto headlines from NewsAPI, write me a 200-word brief.",
    steps: ["coingecko · newsapi · anthropic"],
    done: "./brief.md",
    total: "~$0.06 · 3 calls · 0 taps",
  },
  {
    n: "04",
    tag: "MPP · CREATIVE",
    title: "Concept → demo asset",
    prompt:
      "Use t2 services. Generate a hero image via fal.ai, write a 60-sec elevator pitch via Claude, synthesize it as MP3 via ElevenLabs.",
    steps: ["fal.ai · anthropic · elevenlabs"],
    done: "./hero.png · ./pitch.md · ./pitch.mp3",
    total: "~$0.18 · 3 calls · 0 taps · ~18s",
  },
  {
    n: "05",
    tag: "MPP · REACH",
    title: "Mail mum a birthday card",
    prompt:
      "Use t2 services. It's my mum's birthday next Tuesday. Write her a warm note from me, render it as a card front via fal.ai, and put it in the mail to 123 Lochiel Road via Lob.",
    steps: ["anthropic · fal.ai · lob"],
    done: "Card queued · USPS delivery Tuesday.",
    total: "~$2.08 · 3 calls · 0 taps",
  },
  {
    n: "06",
    tag: "MPP · CODE",
    title: "Write and run",
    prompt:
      "Use t2 services. Write a self-contained Python script that computes a 30-day EMA on sample SUI closes, then run it via Judge0 to verify.",
    steps: ["anthropic · judge0"],
    done: "Script verified · output matches expected.",
    total: "~$0.04 · 2 calls · 0 taps · ~3s",
  },
];

export const NAV_PRODUCTS = [
  { slug: "wallet", name: "Agent Wallet", pkg: "@t2000/cli", desc: "The terminal Agent Wallet.", href: "/agent-wallet" },
  { slug: "payments", name: "Agent Payments", pkg: "@suimpp/mpp", desc: "Pay any API in USDC.", href: "/agent-payments" },
  { slug: "sdk", name: "Agent SDK", pkg: "@t2000/sdk", desc: "TypeScript under everything.", href: "/agent-sdk" },
  { slug: "engine", name: "Agent Engine", pkg: "@t2000/engine", desc: "The engine behind Audric.", href: "/agent-engine" },
  { slug: "models", name: "Agent Models", pkg: "@t2000/models", desc: "Finance models for agents.", href: "#", soon: true },
] as const;

export const NAV_FAMILY = [
  { name: "MPP Gateway", desc: "Every major AI + data API. mpp.t2000.ai", href: "https://mpp.t2000.ai", external: true },
  { name: "suimpp.dev", desc: "The open MPP standard — Sui binding, v0.1.", href: "https://suimpp.dev", external: true },
  { name: "Audric", desc: "Conversational finance.", href: "https://audric.ai", external: true },
] as const;

export const GITHUB_URL = "https://github.com/mission69b/t2000";
export const DEVELOPERS_URL = "https://developers.t2000.ai";
export const AUDRIC_URL = "https://audric.ai";
export const GATEWAY_URL = "https://mpp.t2000.ai";
export const SUIMPP_URL = "https://suimpp.dev";
export const DISCORD_URL = "https://discord.gg/qE95FPt6Z5";
export const TWITTER_URL = "https://x.com/t2000ai";
