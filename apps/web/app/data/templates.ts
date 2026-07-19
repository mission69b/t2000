// Templates SSOT — t2000.ai/templates (prompt-first, founder direction
// 2026-07-19: motionsites-style gallery, every card is a copyable build
// prompt). Categories: Sites · Apps · Agents · Components. The three
// create-t2-app starters live here too (their scaffold command is the
// `scaffold` field); everything else is prompt-only — paste into t2 code
// (or any coding agent on t2000/auto) and build.

export const CREATE_CMD = "npm create t2-app@latest";
export const T2CODE_CMD = "npm i -g @t2000/code && t2code";

export type TemplateCategory = "site" | "app" | "agent" | "component";

export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  site: "Sites",
  app: "Apps",
  agent: "Agents",
  component: "Components",
};

export interface TemplateEntry {
  slug: string;
  name: string;
  category: TemplateCategory;
  oneLiner: string;
  /** The full copyable build prompt. */
  prompt: string;
  /** Optional scaffold command (the create-t2-app starters). */
  scaffold?: string;
  /**
   * Full-page screenshot of the built result (public path). Cards show a
   * top-crop; the modal shows the whole scrollable capture. Entries without
   * one fall back to the CSS-art preview.
   */
  image?: string;
}

export const TEMPLATES: TemplateEntry[] = [
  {
    slug: "aurora-landing",
    image: "/template-previews/aurora-landing.png",
    name: "Aurora Landing",
    category: "site",
    oneLiner:
      "A dark SaaS landing page — radial-glow hero, logo marquee, sticky feature rows, pricing.",
    prompt: `Build a dark SaaS landing page for a fictional product called "Aurora" using React, TypeScript, Tailwind CSS, and Framer Motion. Font: Inter (Google Fonts, weights 400–800). Page title: "Aurora — Ship your agent".

GLOBAL STYLES
- Background #0A0A0B on html, body, and the main wrapper; text #EDEDED.
- CSS class .glow-text: gradient text via background: linear-gradient(180deg, #FFFFFF 0%, #9BA3AF 100%), -webkit-background-clip: text, -webkit-text-fill-color: transparent.
- Section container: max-width 1120px, centered, px-6.
- All section headings: font-bold, tracking-tight, clamp(2rem, 5vw, 3.5rem).

SECTION ORDER
1. Navbar  2. Hero  3. Logo marquee  4. Feature rows  5. Metrics band  6. Pricing  7. CTA footer

1. NAVBAR
Sticky top, 64px tall, backdrop-blur, background rgba(10,10,11,0.75), bottom border rgba(255,255,255,0.08). Left: wordmark "aurora" (font-bold, lowercase). Center links: Product, Pricing, Docs, Changelog (text-sm, #9BA3AF, hover → white, 200ms). Right: ghost "Sign in" + solid white pill "Get started" (text-black, rounded-full, px-4 py-1.5).

2. HERO
Full-viewport (min-h-[92vh]) centered column. Behind the heading, an absolutely-positioned radial glow: 720x460px, background: radial-gradient(46% 46% at 50% 40%, rgba(99,102,241,0.22) 0%, transparent 70%), filter blur(24px).
- Eyebrow pill: "Now in public beta" — rounded-full border rgba(255,255,255,0.14), text-xs uppercase tracking-[0.14em] #9BA3AF, with a 6px pulsing green dot.
- H1 (.glow-text, text-center, font-extrabold, clamp(2.8rem, 7vw, 5.5rem), leading-[1.02]): "Ship your agent." on line 1, "Not your weekend." on line 2.
- Subline: max-w-[560px], #9BA3AF, text-lg, centered.
- Two CTAs: solid white pill "Start building" + ghost pill "View docs →" (border rgba(255,255,255,0.14)).
- Beneath the CTAs: a copyable install strip — rounded-lg border, font-mono text-sm, "$ npm create aurora@latest" with a copy icon button on the right.
- Framer Motion: each hero element fades in (opacity 0→1, y 24→0, duration 0.7, ease [0.25,0.1,0.25,1]) with delays 0 / 0.1 / 0.2 / 0.3 / 0.45.

3. LOGO MARQUEE
"Trusted by teams shipping on the edge" (text-xs uppercase, #6B7280, centered). Below: one row of 10 fictional grayscale wordmarks (plain text, font-semibold, opacity 0.45) scrolling left in an infinite CSS marquee (translateX keyframes, 40s linear, duplicated content for a seamless loop). Fade masks 80px wide on both edges via mask-image: linear-gradient.

4. FEATURE ROWS
Three alternating two-column rows (grid lg:grid-cols-2, gap-16, py-24), image side swapping each row. Text side: eyebrow (text-xs uppercase, indigo-400), heading, paragraph (#9BA3AF), and a "Learn more →" link. Visual side: a browser-chrome mock (rounded-xl border rgba(255,255,255,0.1), 3 window dots, dark #101113 body) containing pure-CSS UI art — no images:
- Row 1 "Deploy in one command": a fake terminal with 3 lines of output and a blinking cursor (CSS animation).
- Row 2 "Observe every run": a fake table with 4 rows, one highlighted, and a green "200" badge per row.
- Row 3 "Scale to zero": a fake area chart drawn with an SVG path + gradient fill.
Each row animates in whileInView (once: true, y 32→0).

5. METRICS BAND
Full-width band, border-y rgba(255,255,255,0.08), py-14. Four stats in a grid: "99.99% uptime", "40ms p50", "2M runs/day", "0 config". Numbers font-mono clamp(1.8rem, 4vw, 2.6rem) white; labels text-sm #6B7280.

6. PRICING
Three cards (grid md:grid-cols-3, gap-5): Free / Pro ($20/mo, highlighted with an indigo border and "Popular" chip) / Enterprise. Each: name, price, 5 checklist rows (checkmark SVG + text-sm #9BA3AF), full-width CTA button (solid white on Pro, ghost on the others). Cards: rounded-2xl, border rgba(255,255,255,0.1), background #0F1011, hover border brightens.

7. CTA FOOTER
Centered closer: H2 "Start shipping tonight." (.glow-text), subline, one solid white CTA. Below, a 4-column footer (Product / Company / Resources / Legal) with text-sm #6B7280 links and a bottom bar: "© Aurora" left, tiny status pill "All systems normal" right (green dot).

DEPENDENCIES
react, react-dom, framer-motion, tailwindcss, vite, typescript. Mobile-first; heavy use of clamp() for fluid type; test at 375px, 768px, 1440px.`,
  },
  {
    slug: "founder-portfolio",
    image: "/template-previews/founder-portfolio.png",
    name: "Founder Portfolio",
    category: "site",
    oneLiner:
      "A bold typographic portfolio — gradient mega-headline, scroll-reveal about, sticky-stacking project cards.",
    prompt: `Build a one-page portfolio for a fictional maker called "Ren" using React, TypeScript, Tailwind CSS, and Framer Motion. Dark theme (#0C0C0D background), font Space Grotesk (Google Fonts, 300–700). Page title: "Ren — builds things that ship".

GLOBAL STYLES
- .mega-text: gradient text linear-gradient(180deg, #6A7078 0%, #C9D4DC 100%), background-clip text, transparent fill.
- Body text color #D3DCE3; muted #7C848C.
- overflow-x: clip on the main wrapper.

SECTION ORDER: Hero → Marquee strip → About → Work (sticky stack) → Contact.

1. HERO (h-screen, flex column)
- Top nav: justify-between row of 4 uppercase links (Work, About, Notes, Contact), tracking-wider, text-sm md:text-base, color #D3DCE3, hover opacity-70.
- Mega headline h1: "REN BUILDS" — .mega-text, font-bold, uppercase, whitespace-nowrap, leading-none, text-[15vw], w-full, wrapped in overflow-hidden.
- Bottom bar (justify-between, items-end, pb-10): left, a max-w-[240px] uppercase font-light paragraph "independent maker shipping agents, sites and tools since 2019"; right, a pill CTA "Say hi →" (rounded-full, border-2 #D3DCE3, uppercase, tracking-widest, hover bg-white/10).
- FadeIn stagger: nav (delay 0, y -16), headline (0.15, y 40), left text (0.35, y 16), CTA (0.5, y 16).

2. MARQUEE STRIP
A single row of uppercase font-mono text items separated by "·" ("TYPESCRIPT · RUST · SUI · AGENTS · DESIGN SYSTEMS · CLI TOOLS ·"), duplicated for a seamless infinite CSS marquee (30s linear), border-y rgba(255,255,255,0.08), py-4, text #7C848C.

3. ABOUT (min-h-screen, centered)
- Heading "ABOUT" — .mega-text, clamp(3rem, 12vw, 150px), centered.
- Scroll-driven paragraph: character-by-character opacity reveal using Framer Motion useScroll on the paragraph (offset ['start 0.8','end 0.25']); each char animates opacity 0.2 → 1 by its index. Text (~40 words) about shipping small sharp tools. max-w-[560px], centered, clamp(1rem, 2vw, 1.3rem).
- Four decorative rotated squares (CSS only, border rgba(255,255,255,0.12), 80–140px) absolutely placed near the corners, each FadeIn from the nearest edge (x ±60, duration 0.9, staggered 0.1).

4. WORK — STICKY-STACKING CARDS
Heading "WORK" (.mega-text, same scale). Then 3 project cards that stack as you scroll: each card wrapped in an h-[85vh] container, the card itself sticky top-24, offset top: index*24px. Scale trick: targetScale = 1 − (total − 1 − index) * 0.04 via useScroll + useTransform on the section.
Card: rounded-[36px], border-2 #2A2D31, background #101113, p-6 md:p-10. Inside: huge index number ("01") font-bold clamp(3rem, 9vw, 120px) opacity-20; project name (clamp(1.4rem, 3vw, 2.4rem), font-medium); one-line description (muted); a "Visit →" ghost pill. Right side: a pure-CSS abstract thumbnail — a 16:10 rounded-2xl panel with a unique CSS gradient per project (indigo/emerald/amber radial mixes), no images.
Projects: 01 "Relay" (a streaming chat client) · 02 "Ledgerline" (a wallet dashboard) · 03 "Fieldnotes" (a markdown notes PWA).

5. CONTACT
Full-height centered closer: "LET'S BUILD" (.mega-text), a mailto pill CTA, and a tiny footer row (© year, GitHub / X links, uppercase, text-xs, muted).

DEPENDENCIES: react, framer-motion, tailwindcss, vite, typescript. Fluid type with clamp() everywhere; graceful from 360px to ultrawide.`,
  },
  {
    slug: "wallet-app",
    image: "/template-previews/wallet-app.png",
    name: "Wallet App Showcase",
    category: "app",
    oneLiner:
      "Three iPhone mockups of a USDC wallet app — balance, send flow, activity — pure CSS frames.",
    prompt: `Build a mobile-app showcase page displaying 3 iPhone mockups for a fictional USDC wallet called "Ledgerline", using React, TypeScript, and Tailwind CSS. Font: Inter. Page background: #101113. No screenshot images — every screen is built from real DOM.

LAYOUT
- Desktop: 3 phones side by side (flex, gap-12, centered, py-20). Below 900px: stack vertically, scale phones to fit (transform scale, origin top).
- iPhone frame: 375x812 artboard inside a black rounded shell (border-radius 54px, border 2px #2A2A2A, padding 12px), with a dynamic-island notch (126x36, black, rounded-full, centered top) and a home indicator (134x5, white/30, rounded, centered bottom). Soft shadow: 0 12px 24px rgba(0,0,0,0.35).
- Each frame fades in with a 600ms staggered entrance (opacity + y 24→0).

SCREEN 1 — BALANCE
Dark screen (#0C0D0E). Status row (9:41, signal/wifi/battery glyphs as tiny SVGs). Header: avatar circle + "Hey, Ren" + a bell icon. Centered balance block: "$1,284.50" (56px, font-semibold, white) over "USDC on Sui · gasless" (13px, #8A929A). Two pill buttons: "Send" (solid white, black text) and "Receive" (ghost, border white/20). Asset list: 3 rows (USDC / USDsui / SUI), each with a colored monogram circle, name, and right-aligned amount + USD value (font-mono). Bottom tab bar: 4 icons (Home, Activity, Card, Settings), active tab white, others #5A6068.

SCREEN 2 — SEND FLOW
Same chrome. Title "Send USDC". Recipient field showing "ren.sui" resolved to a truncated 0x… address (green check). Big amount keypad screen: "$25.00" (48px) centered, a 3x4 number pad (large touch targets, 64px rows, #16181A keys, rounded-2xl), "Max $1,284" chip. Sticky bottom CTA: full-width rounded-2xl "Review send" (white). Above it a fee line: "Network fee: $0.00 — sponsored" (13px, #34D399).

SCREEN 3 — ACTIVITY
Title "Activity" + month header "July". A list of 6 transactions grouped by day: each row has a direction icon (↑ sent / ↓ received / ⇄ swap in tinted circles), a title ("Sent to kai.sui", "Received from Job escrow", "Swapped SUI → USDC"), a timestamp, and a right-aligned signed amount (−$25.00 in white, +$140.00 in #34D399, font-mono). One row carries a small "receipt ↗" link chip. Pull-to-refresh spinner hinted at top (static, 40% opacity).

DETAILS
- All type Inter; amounts font-mono (tabular-nums).
- Color palette: bg #0C0D0E, cards #16181A, hairlines rgba(255,255,255,0.07), muted #8A929A, success #34D399.
- Add a small caption under each phone: screen name, 13px, #8A929A, centered.

DEPENDENCIES: react, tailwindcss, vite, typescript. No external images, no icon fonts — inline SVGs only.`,
  },
  {
    slug: "chat",
    name: "AI Chat App",
    category: "app",
    oneLiner: "A streaming AI chat app in two files — no SDK, private by default.",
    scaffold: `${CREATE_CMD} my-chat -- --template chat`,
    prompt: `Build a streaming AI chat web app with Next.js (App Router) and TypeScript — no AI SDK, two files of wiring.

1. RELAY ROUTE (app/api/chat/route.ts)
POST handler that forwards { messages } (last 20 turns) to an OpenAI-compatible endpoint — base URL https://api.t2000.ai/v1, model "t2000/auto", key from process.env.T2000_API_KEY (server-side only; never expose it to the client). Request stream: true, then pipe the upstream SSE body straight through as the response with content-type text/event-stream. Surface the x-t2000-served-model response header by copying it onto the relay response.

2. CHAT UI (app/page.tsx, "use client")
- Message list: user bubbles right-aligned (accent background), assistant bubbles left (bordered card). Auto-scroll to bottom on new tokens.
- A ~30-line SSE parser: read the fetch body with getReader(), split on double newlines, JSON.parse each "data:" line, append delta.content to the last assistant message; stop on [DONE].
- Each assistant reply shows a small "served by <model>" badge underneath, read from the relay's served-model header.
- Input row pinned to the bottom: textarea grows to 4 rows max, Enter sends / Shift+Enter newline, disabled while streaming, with a stop button that aborts the fetch via AbortController.
- Dark theme: bg #0B0C0D, bubbles #131517, hairline borders rgba(255,255,255,0.08), Inter font.

3. EXTRAS
- Keep chat history in useState only (no DB). "New chat" button clears it.
- Handle upstream errors by appending a red-tinted system bubble with the error text.
- README with the two-line setup: set T2000_API_KEY, npm run dev.`,
  },
  {
    slug: "agent-worker",
    name: "Agent Worker",
    category: "agent",
    oneLiner: "The smallest useful agent — a headless worker on t2000/auto.",
    scaffold: `${CREATE_CMD} my-worker -- --template agent-worker`,
    prompt: `Build the smallest useful headless agent in one TypeScript file (Node 18+, no framework).

- Read a task string from process.argv (default: "Summarize the latest Sui developer changelog in 5 bullets").
- Call the OpenAI-compatible endpoint at https://api.t2000.ai/v1/chat/completions with model "t2000/auto", stream: true, key from T2000_API_KEY.
- Stream tokens to stdout as they arrive (raw SSE parsing with fetch + getReader — no SDK).
- After the stream ends, print a dim footer line with the served model (x-t2000-served-model response header) and the route reason if present.
- Wrap the call in a run(task) function so the file can also be imported; add a package.json with "start": "tsx worker.ts".
- Then extend it into a loop: accept a JSON array of tasks from tasks.json, run them sequentially, and write results to out/<index>.md. Keep the whole thing under ~120 lines.`,
  },
  {
    slug: "market-brief-agent",
    name: "Market Brief Agent",
    category: "agent",
    oneLiner:
      "An agent that buys its own data — pays x402 APIs in USDC, then writes a morning brief.",
    prompt: `Build a "morning market brief" agent as a Node 18+ TypeScript script that PAYS for its own data over x402 using the t2000 Agent Wallet.

SETUP ASSUMPTIONS
- @t2000/cli is installed and a funded wallet exists at ~/.t2000/wallet.key (if not, tell me to run: npm i -g @t2000/cli && t2 init && t2 fund).
- Use the @t2000/sdk (import { T2000 } from "@t2000/sdk") for programmatic payments: agent.pay({ url, body, maxPrice }).

PIPELINE (run() in src/brief.ts)
1. Discover: fetch https://mpp.t2000.ai/api/services (free) and pick a crypto-prices service and a news/search service from the catalog.
2. Pay: call each service via agent.pay with maxPrice 0.05 — one call for BTC/ETH/SUI prices + 24h change, one for the top 5 crypto headlines.
3. Compose: send both payloads to https://api.t2000.ai/v1/chat/completions (model t2000/auto) with a system prompt: "You write a 150-word morning brief: 1 paragraph of market state, then 3 terse bullets of what matters today. No hype."
4. Output: write brief-YYYY-MM-DD.md and print it, followed by a cost line: "Data cost: $0.0X across N paid calls" (sum the amounts from each pay receipt).

GUARDRAILS
- Hard-cap total spend at $0.25 per run; abort with a clear message if a challenge exceeds maxPrice.
- If a paid call fails, continue with the remaining data and note the gap in the brief.
- Keep it under ~150 lines; package.json script "brief": "tsx src/brief.ts".`,
  },
  {
    slug: "selling-agent",
    name: "Selling Agent",
    category: "agent",
    oneLiner:
      "An agent that earns — registers an Agent ID, lists a service, watches its job inbox, delivers.",
    prompt: `Set me up as a selling agent on t2 Agents (agents.t2000.ai) — an agent that earns USDC over on-chain escrow jobs. Use the @t2000/cli (npm i -g @t2000/cli).

1. IDENTITY
Run t2 init (free on-chain Agent ID, gasless) if there's no wallet yet, then t2 agent create --name "<ask me for a name>" --description "<one line on what I sell>". Show me the profile URL.

2. LIST A SERVICE
Ask me for: what I deliver, a fixed USDC price (≤ $50), and a delivery SLA. Then run:
t2 service create --name "<name>" --price <usdc> --sla <e.g. 24h> --description "<desc>" --deliverable "<what the buyer receives>" --requirements '{"<field>":"<what the buyer must provide>"}'
Confirm it's live with t2 service list and show where buyers see it (my profile + agents.t2000.ai/jobs + t2 browse).

3. WORK THE INBOX
Write a small Node script (or a shell loop) around t2 job watch --mine that alerts me when a job lands. For each funded job walk me through:
- t2 job spec <jobId> — read the buyer's brief (hash-pinned on-chain)
- do the work with me
- t2 job deliver <jobId> <file-or-text> — post proof-of-delivery before the SLA

4. EXPLAIN THE MONEY
Funds release when the buyer accepts or their review window lapses (5% protocol fee at settlement; refunds are fee-free). After release, point me at my review score. Never move funds without showing me the command first.`,
  },
  {
    slug: "sui-dapp",
    name: "Sui dApp",
    category: "app",
    oneLiner:
      "Wallet connect, gRPC reads, and an AI copilot that knows your holdings.",
    scaffold: `${CREATE_CMD} my-dapp -- --template sui-dapp`,
    prompt: `Build a Sui dApp with Next.js (App Router), TypeScript, and @mysten/dapp-kit.

1. WALLET + READS
- ConnectButton flow via dapp-kit providers (QueryClientProvider + SuiClientProvider + WalletProvider), mainnet.
- After connect, read balances with SuiGrpcClient (@mysten/sui/grpc — do NOT use JSON-RPC; it retires July 2026) and render an asset list: coin symbol, human amount (respect on-chain decimals), USD value where known.

2. AI COPILOT
- A chat panel beside the balance list. Relay route posts to https://api.t2000.ai/v1/chat/completions (model t2000/auto, T2000_API_KEY server-side), streaming SSE back to the client.
- Inject the connected wallet's holdings into the system prompt each turn ("The user holds: …") so answers are grounded — the copilot explains, the wallet signs; never build or submit transactions from the copilot.

3. LOOK
Dark theme (#0B0C0D), hairline borders, Inter; balance amounts font-mono. Empty state before connect: centered ConnectButton with one line of copy. README covering env setup and the gRPC-only constraint.`,
  },
  {
    slug: "terminal-hero",
    image: "/template-previews/terminal-hero.png",
    name: "Terminal Hero",
    category: "component",
    oneLiner:
      "A hero section with a live-typing terminal window — the dev-tool landing classic.",
    prompt: `Build a reusable React + TypeScript + Tailwind hero section component <TerminalHero /> with a self-typing terminal.

LAYOUT
Two-column grid (lg:grid-cols-[1.05fr_0.95fr], gap-12, items-center, min-h-[80vh]) on a #0A0A0B background. Left: eyebrow pill, H1 with gradient text (linear-gradient(180deg,#FFF 0%,#9BA3AF 100%), background-clip text), a muted subline, two pill CTAs. Right: the terminal.

TERMINAL WINDOW
Rounded-xl, border rgba(255,255,255,0.12), background #0D0E10, header bar (#121316) with three 8px dots and a font-mono title ("~/demo"). Body: font-mono text-[13px], leading-7, p-5, min-h-[280px].

TYPING ENGINE
Props: lines: Array<{ text: string; kind: "cmd" | "out" | "ok" }>, speed (ms/char, default 24), startDelay. Behavior: types each "cmd" line char-by-char behind a "$ " prompt with a blinking block cursor (CSS steps() animation); "out" lines appear instantly after their command finishes; "ok" lines render green (#34D399) prefixed with "✓". Loop: after the last line, hold 3s, fade the body to empty (300ms), restart. Respect prefers-reduced-motion: render all lines statically.

Default demo lines: "npm i -g @t2000/cli" → "added 1 package in 2s" → "t2 init" → "✓ wallet created · agent id #241" → "t2 pay https://…/chat/completions" → "✓ paid $0.02 · 200 OK".

Export the component with all copy overridable via props; include a usage example in App.tsx.`,
  },
  {
    slug: "stack-cards",
    image: "/template-previews/stack-cards.png",
    name: "Sticky-Stack Cards",
    category: "component",
    oneLiner:
      "Scroll-driven stacking cards — each card pins and scales as the next one arrives.",
    prompt: `Build a reusable React + TypeScript + Tailwind + Framer Motion section component <StackCards items={...} /> implementing the sticky-stacking card effect.

MECHANIC
Each card sits in its own h-[90vh] wrapper; the card itself is sticky top-20, offset top: index * 24px. Using useScroll on the whole section and useTransform per card, scale each earlier card down as later ones arrive: targetScale = 1 − (total − 1 − index) * 0.04, animated over that card's scroll range. Cards never unpin until the section ends.

CARD
Rounded-[32px], border rgba(255,255,255,0.12), background #101113, p-8 md:p-12, min-h-[420px]. Contents from props: an index number rendered huge and low-opacity (clamp(3rem,8vw,110px), opacity 0.15) top-left; title (clamp(1.5rem,3vw,2.5rem)); body paragraph (muted #9BA3AF, max-w-xl); optional CTA pill. Give each card an accentColor prop that tints a radial gradient in its top-right corner (rgba(accent,0.16) → transparent).

DETAILS
- Section heading above the stack: props title + eyebrow.
- prefers-reduced-motion: disable the scale transform, keep normal stacking.
- Demo data: 3 cards ("Fund", "Deliver", "Settle") with indigo / emerald / amber accents.
- Ship as one file with a usage example; no external CSS beyond Tailwind.`,
  },
  {
    slug: "radial-hero",
    image: "/template-previews/radial-hero.png",
    name: "Radial-Glow Hero",
    category: "component",
    oneLiner:
      "A centered hero over a soft radial glow, with a copyable prompt strip — the t2 Agents pattern.",
    prompt: `Build a reusable React + TypeScript + Tailwind hero component <RadialHero /> — centered text over a soft radial glow, with a copy-prompt strip.

GLOW
An absolutely-positioned, pointer-events-none div behind the content: 720x460px, centered horizontally (left-1/2 -translate-x-1/2, -top-24), background: radial-gradient(46% 46% at 50% 40%, rgba(0,114,245,0.16) 0%, transparent 70%), filter blur(20px). Accent color from a prop (default #0072F5).

CONTENT (centered column, relative)
- Eyebrow: inline-flex pill with a 6px pulsing dot + uppercase tracking-[0.14em] text-xs label.
- H1: two lines from props, font-extrabold, clamp(2.6rem, 7vw, 4.8rem), tracking-tight, leading-[1.04].
- Subline: max-w-[520px] mx-auto, muted (#9BA3AF), text-lg.
- Two CTAs: primary solid pill + ghost pill, from props.

PROMPT STRIP
Beneath the CTAs: a max-w-[680px] rounded-[10px] dashed-border card (border rgba(255,255,255,0.15)), left-aligned. Inside: the prompt text (font-mono, text-[12.5px], leading-relaxed, muted) and a "Copy prompt" ghost button top-right that writes the prompt to the clipboard and swaps its label to "Copied ✓" for 1.6s. Below the prompt, a caption row (text-xs, subtler) from props.

Entrance: stagger each block with a fade+rise (Framer Motion optional — CSS animation fine). Fully prop-driven; include a demo usage with realistic copy. Dark page assumed (#0A0A0B).`,
  },
];
