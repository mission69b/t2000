// Templates SSOT — t2000.ai/templates (the Vercel-gallery shape, founder
// direction 2026-07-16: visual cards, one line each; the words live on the
// detail pages). Every template is router-wired: t2000/auto against
// api.t2000.ai/v1, scaffolded by `npm create t2-app@latest`.

export const CREATE_CMD = "npm create t2-app@latest";

export interface TemplateDef {
  slug: string;
  name: string;
  oneLiner: string;
  /** Longer paragraph for the detail page. */
  about: string;
  stack: string[];
  included: string[];
  firstRun: string;
  /** Optional extra command surfaced on the detail page. */
  extra?: { label: string; cmd: string };
}

export const TEMPLATES: TemplateDef[] = [
  {
    slug: "chat",
    name: "AI Chat App",
    oneLiner: "A streaming AI chat app in two files — no SDK, private by default.",
    about:
      "A Next.js chat app with a hand-written SSE relay route and a ~30-line client parser you can actually read. Your key stays server-side; the UI shows which model served each reply. Swap the system prompt and ship.",
    stack: ["Next.js", "TypeScript", "t2000/auto"],
    included: [
      "Streaming chat UI with a served-model badge",
      "SSE relay route — the last 20 turns to t2000/auto",
      "AGENTS.md + plans/ for any coding agent",
      "Per-repo privacy pin (.t2000/config.json, private by default)",
    ],
    firstRun: "npm run dev",
  },
  {
    slug: "agent-worker",
    name: "Agent Worker",
    oneLiner: "The smallest useful agent — a headless worker on t2000/auto.",
    about:
      "One TypeScript file that makes one router call and streams the answer to your terminal, printing the served model and route reason. Grow it into a task loop, a cron job, or a GitHub Action.",
    stack: ["TypeScript", "Node", "t2000/auto"],
    included: [
      "Headless worker script — one call, streamed",
      "x-t2000-served-model + route reason printed per run",
      "AGENTS.md + plans/ with the plan-expensive / execute-cheap recipe",
      "Per-repo privacy pin (.t2000/config.json, private by default)",
    ],
    firstRun: "npm start",
  },
  {
    slug: "sui-dapp",
    name: "Sui dApp",
    oneLiner: "Wallet connect, gRPC reads, and an AI copilot that knows your holdings.",
    about:
      "A Next.js dApp with dapp-kit wallet connect, balance reads served by SuiGrpcClient (JSON-RPC retires July 2026), and a streaming AI copilot that receives the connected wallet's holdings as context — it explains, your wallet signs.",
    stack: ["Next.js", "dapp-kit", "gRPC", "t2000/auto"],
    included: [
      "ConnectButton wallet flow + live balance list",
      "gRPC-only chain reads, floor-never-round display amounts",
      "AI copilot with the connected wallet as context",
      "Sui ground rules in AGENTS.md + Mysten skills one-liner",
    ],
    firstRun: "npm run dev",
    extra: {
      label: "Official Sui Agent Skills (Mysten Labs)",
      cmd: "npx skills add mystenlabs/skills --all",
    },
  },
];

export function scaffoldCmd(slug: string): string {
  return `${CREATE_CMD} my-app -- --template ${slug}`;
}

export function getTemplate(slug: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.slug === slug);
}
