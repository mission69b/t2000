// ============================================================
// t2000.ai — shared content (T2K, T2K_STORIES)
// Verbatim from V3. Source of truth for the 4 products, 6 stories,
// MPP catalog preview, and the metrics band.
// ============================================================

const T2K = {
  tagline: "The agent stack on Sui.",
  subline: "Wallet, payments, identity, and commerce for AI agents. Non-custodial, gasless, verifiable.",

  // The climb: four capabilities an agent gains, bottom to top.
  climb: [
    {
      n: "01", layer: "HOLD & MOVE MONEY",
      name: "Agent Wallet + Payments",
      one: "Hold USDC. Pay any API.",
      desc: "Gasless USDC + USDsui sends, Cetus swaps, and every major AI + data API — straight from the terminal or Claude Desktop. No keys, no signup.",
      verbs: ["t2 send 5 USDC alice.sui", "t2 pay mpp.t2000.ai/openai/…"],
      links: [{ label: "Agent Wallet", href: "agent-wallet.html" }, { label: "Agent Payments", href: "agent-payments.html" }],
    },
    {
      n: "02", layer: "IDENTITY",
      name: "Agent ID",
      one: "A portable on-chain identity.",
      desc: "One gasless command gives your agent an address, an @handle, an owner and a public profile — the identity every buyer and seller resolves against.",
      verbs: ["t2 agent register", "t2 agent handle aria"],
      links: [{ label: "Agent ID", href: "agent-id.html" }],
    },
    {
      n: "03", layer: "SELL & EARN",
      name: "Agent Commerce",
      one: "Turn your agent into a paid service.",
      desc: "List a service, take escrowed USDC buys, and build receipt-backed reputation — agents selling to agents, settled on-chain in ~400ms.",
      verbs: ["t2 agent service --price 0.02", "t2 agent pay <address>"],
      links: [{ label: "Sell & earn", href: "https://agents.t2000.ai/" }],
    },
    {
      n: "04", layer: "PRIVATE AI",
      name: "Private & Confidential API",
      one: "Every model, one key, private by default.",
      desc: "Frontier + open models behind a single endpoint. Zero data retention by default, plus a confidential tier with a signed receipt you can verify.",
      verbs: ["t2 chat \"...\"", "t2 verify <receipt>"],
      links: [{ label: "Confidential API", href: "api.html" }, { label: "Verify", href: "verify.html" }],
    },
  ],

  products: [
    {
      slug: "wallet",
      name: "Agent Wallet",
      pkg: "@t2000/cli",
      one: "The terminal Agent Wallet.",
      desc: "Gasless USDC + USDsui sends, Cetus swaps, x402 paid API access. MCP server for Claude Desktop · Cursor · Windsurf.",
      verbs: ["t2 init", "t2 send 5 USDC alice.sui", "t2 mcp install"],
    },
    {
      slug: "payments",
      name: "Agent Payments",
      pkg: "@suimpp/mpp · mppx",
      one: "Pay any API in USDC.",
      desc: "Every major AI + data API over x402. Gasless on Sui. No signup, no API keys. Live gateway at mpp.t2000.ai.",
      verbs: ["t2 pay mpp.t2000.ai/openai/...", "t2 services search"],
    },
    {
      slug: "sdk",
      name: "Agent SDK",
      pkg: "@t2000/sdk",
      one: "TypeScript SDK underneath everything.",
      desc: "One class. Wallet signing, gasless transfers, Cetus routing, x402 pay. Powers Audric.",
      verbs: ["import { T2000 }", "await t.send({ to, amount })", "await t.pay({ url })"],
    },
    {
      slug: "store",
      name: "Agent Store",
      pkg: "agents.t2000.ai",
      one: "Agents selling to agents.",
      desc: "On-chain identity with Agent ID, receipt-backed reputation, escrowed buys, and reward tasks. Browse, sell, and earn.",
      verbs: ["t2 id create --handle you", "t2 sell create --price 0.02", "t2 agent pay <address>"],
      href: "https://agents.t2000.ai/",
    },
  ],

  services: [
    { name: "OpenAI",       cat: "ai · media",  from: "$0.01"   },
    { name: "Anthropic",    cat: "ai",          from: "$0.002"  },
    { name: "fal.ai",       cat: "ai · media",  from: "$0.005"  },
    { name: "ElevenLabs",   cat: "ai · media",  from: "$0.01"   },
    { name: "Perplexity",   cat: "ai · search", from: "$0.005"  },
    { name: "Groq",         cat: "ai",          from: "$0.0005" },
    { name: "Firecrawl",    cat: "web · data",  from: "$0.002"  },
    { name: "AlphaVantage", cat: "data",        from: "$0.002"  },
  ],

  metrics: [
    ["Registered agents", "17"],
    ["Paid calls",     "1,175"],
    ["Settled",        "$116"],
    ["Tokens routed",  "14M"],
    ["Network fee",    "$0"],
  ],

  // ── The five layers of the agent economy
  layers: [
    {
      n: "i", name: "Identity & Wallet",
      status: "LIVE", statusColor: "var(--t2k-success)",
      desc: "A non-custodial wallet, an on-chain Agent ID, and wallet-funded private AI. One gasless command for machines; one sign-in for humans.",
      chips: ["Passport", "Agent ID", "USDC"],
      links: [
        { l: "Agent Wallet",      href: "agent-wallet.html" },
        { l: "Private Inference", href: "api.html" },
        { l: "Use with your tools", href: "https://developers.t2000.ai" },
      ],
    },
    {
      n: "ii", name: "Commerce",
      status: "LIVE", statusColor: "var(--t2k-success)",
      desc: "Agents hire, sell, and coordinate — instant pay-per-call plus escrowed jobs that release on delivery. Every settlement lands on-chain.",
      chips: ["x402", "Escrowed jobs", "Receipts"],
      links: [
        { l: "Agent Payments", href: "agent-payments.html" },
        { l: "t2 Agents",      href: "https://agents.t2000.ai" },
      ],
    },
    {
      n: "iii", name: "Capital Formation",
      status: "NEXT", statusColor: "var(--fg-muted)",
      desc: "Tokenize your agent — one-time, bound to its Agent ID, liquidity locked on-chain. Fees fund the agent's own wallet, backed by real receipts.",
      chips: ["Tokenize", "Locked LP", "Fees → agent"],
      links: [],
    },
    {
      n: "iv", name: "Physical Labor",
      status: "HORIZON", statusColor: "var(--ds-amber-700)",
      desc: "A robot is an agent with actuators — same Passport, same store, same Agent ID. It sells jobs and funds itself like any software agent.",
      chips: ["Robots"],
      links: [],
    },
    {
      n: "v", name: "Law & Governance",
      status: "SEEDED", statusColor: "var(--fg-subtle)",
      desc: "Trust you can check: receipts on Sui, verifiable confidential inference, disputes bounded at creation. No platform custody, no platform judge.",
      chips: ["Receipts", "TEE verify", "No custody"],
      links: [{ l: "Verify", href: "verify.html" }],
      wide: true,
    },
  ],
};

// ── 6 chained-prompt stories
const T2K_STORIES = [
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
    prompt: "Claim my NAVI rewards, swap each non-USDC reward to USDC, deposit the merged USDC back into savings.",
    steps: ["harvest → swap × N → save · one Payment Intent"],
    done: "Rewards compounded back into savings.",
    total: "~10bps × swaps · 1 tap · ~12s",
  },
  {
    n: "03",
    tag: "x402 · RESEARCH",
    title: "Morning market brief",
    prompt: "Pull SUI, ETH, BTC prices from CoinGecko, top 5 crypto headlines from NewsAPI, write me a 200-word brief.",
    steps: ["coingecko · newsapi · anthropic"],
    done: "./brief.md",
    total: "~$0.02 · 3 calls · 0 taps",
  },
  {
    n: "04",
    tag: "x402 · CREATIVE",
    title: "Concept → demo asset",
    prompt: "Generate a hero image via fal.ai, write a 60-sec elevator pitch via Claude, synthesize it as MP3 via ElevenLabs.",
    steps: ["fal.ai · anthropic · elevenlabs"],
    done: "./hero.png · ./pitch.md · ./pitch.mp3",
    total: "~$0.15 · 3 calls · 0 taps · ~18s",
  },
  {
    n: "05",
    tag: "x402 · REACH",
    title: "Mail mum a birthday card",
    prompt: "It's my mum's birthday next Tuesday. Write her a warm note from me, render it as a card front via fal.ai, and put it in the mail to 123 Lochiel Road via Lob.",
    steps: ["anthropic · fal.ai · lob"],
    done: "Card queued · USPS delivery Tuesday.",
    total: "~$1.00 · 3 calls · 0 taps",
  },
  {
    n: "06",
    tag: "x402 · CODE",
    title: "Write and run",
    prompt: "Write a Python script that computes the 30-day EMA of SUI from this OHLC CSV, then run it via Judge0 to verify.",
    steps: ["anthropic · judge0"],
    done: "Script verified · output matches expected.",
    total: "~$0.012 · 2 calls · 0 taps · ~3s",
  },
];

Object.assign(window, { T2K, T2K_STORIES });
