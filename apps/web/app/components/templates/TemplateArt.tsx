// Pure-CSS preview art for template entries — one small mock per slug,
// same Frame chrome as the original template previews. No screenshots.
import { Frame, TemplatePreview } from "./TemplatePreview";

const CHROME_BG = "#111214";

function GlowHeroPreview({ line1, line2 }: { line1: string; line2: string }) {
  return (
    <Frame title="localhost:3000">
      <div className="relative flex h-full flex-col items-center justify-center gap-2 overflow-hidden">
        <div
          className="pointer-events-none absolute"
          style={{
            width: 260,
            height: 160,
            top: -20,
            background:
              "radial-gradient(46% 46% at 50% 40%, rgba(99,102,241,0.3) 0%, transparent 70%)",
            filter: "blur(14px)",
          }}
        />
        <span
          className="relative rounded-full border px-2 py-0.5 text-[7.5px] uppercase tracking-[0.12em]"
          style={{ borderColor: "var(--ds-gray-alpha-400)", color: "var(--fg-subtle)" }}
        >
          Now in public beta
        </span>
        <div
          className="relative text-center text-[19px] font-extrabold leading-[1.05] tracking-tight"
          style={{
            background: "linear-gradient(180deg,#FFF 0%,#9BA3AF 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {line1}
          <br />
          {line2}
        </div>
        <div className="relative mt-1 flex items-center gap-2">
          <span
            className="rounded-full px-2.5 py-1 text-[8px] font-medium"
            style={{ background: "#fff", color: "#000" }}
          >
            Start building
          </span>
          <span
            className="rounded-full border px-2.5 py-1 text-[8px]"
            style={{ borderColor: "var(--ds-gray-alpha-400)", color: "var(--fg-muted)" }}
          >
            View docs →
          </span>
        </div>
      </div>
    </Frame>
  );
}

function PortfolioPreview() {
  return (
    <Frame title="ren.dev">
      <div className="flex h-full flex-col justify-between">
        <div
          className="flex justify-between text-[7px] uppercase tracking-[0.14em]"
          style={{ color: "var(--fg-muted)" }}
        >
          <span>Work</span>
          <span>About</span>
          <span>Notes</span>
          <span>Contact</span>
        </div>
        <div
          className="whitespace-nowrap text-center text-[34px] font-bold uppercase leading-none tracking-tight"
          style={{
            background: "linear-gradient(180deg,#6A7078 0%,#C9D4DC 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          REN BUILDS
        </div>
        <div className="flex items-end justify-between">
          <span
            className="max-w-[110px] text-[7px] uppercase leading-relaxed"
            style={{ color: "var(--fg-subtle)" }}
          >
            independent maker shipping agents, sites and tools
          </span>
          <span
            className="rounded-full border-2 px-2.5 py-1 text-[7.5px] uppercase tracking-widest"
            style={{ borderColor: "#D3DCE3", color: "#D3DCE3" }}
          >
            Say hi →
          </span>
        </div>
      </div>
    </Frame>
  );
}

function PhonePreview() {
  return (
    <Frame title="Ledgerline — 3 screens">
      <div className="flex h-full items-center justify-center gap-3">
        {[
          ["$1,284", "Balance"],
          ["$25.00", "Send"],
          ["+$140", "Activity"],
        ].map(([amt, label]) => (
          <div
            className="flex h-[136px] w-[64px] flex-col items-center rounded-[14px] border pt-3"
            key={label}
            style={{ background: CHROME_BG, borderColor: "var(--ds-gray-alpha-400)" }}
          >
            <span
              className="mb-2 rounded-full"
              style={{ width: 20, height: 5, background: "#000" }}
            />
            <span
              className="mt-3 font-mono text-[11px] font-semibold"
              style={{ color: "var(--fg)" }}
            >
              {amt}
            </span>
            <span className="text-[7px]" style={{ color: "var(--fg-subtle)" }}>
              {label}
            </span>
            <span
              className="mt-auto mb-1.5 rounded-full"
              style={{ width: 24, height: 3, background: "var(--ds-gray-alpha-400)" }}
            />
          </div>
        ))}
      </div>
    </Frame>
  );
}

function BriefPreview() {
  return (
    <Frame title="~/brief — npm run brief">
      <div className="flex h-full flex-col gap-1.5 font-mono text-[9.5px] leading-relaxed">
        <div style={{ color: "var(--fg-subtle)" }}>
          <span style={{ color: "var(--t2k-success)" }}>$</span> npm run brief
        </div>
        <div style={{ color: "var(--t2k-success)" }}>✓ paid $0.02 — crypto prices</div>
        <div style={{ color: "var(--t2k-success)" }}>✓ paid $0.03 — top headlines</div>
        <div style={{ color: "var(--fg-muted)" }}>
          Markets steadied overnight; SUI led majors…
        </div>
        <div className="mt-auto" style={{ color: "var(--fg-subtle)" }}>
          Data cost: <span style={{ color: "var(--t2k-accent)" }}>$0.05</span> across 2
          paid calls
        </div>
      </div>
    </Frame>
  );
}

function SellingPreview() {
  return (
    <Frame title="t2 job watch --mine">
      <div className="flex h-full flex-col gap-2">
        {[
          ["Daily brief", "funded · $2.00", "var(--t2k-accent)"],
          ["Logo sketch", "delivered", "var(--fg-subtle)"],
          ["Code review", "released · +$15.00", "var(--t2k-success)"],
        ].map(([name, state, color]) => (
          <div
            className="flex items-center justify-between rounded-md border px-3 py-2"
            key={name}
            style={{ background: CHROME_BG, borderColor: "var(--ds-gray-alpha-300)" }}
          >
            <span className="text-[9.5px] font-medium" style={{ color: "var(--fg)" }}>
              {name}
            </span>
            <span className="font-mono text-[8.5px]" style={{ color: color as string }}>
              {state}
            </span>
          </div>
        ))}
        <div className="mt-auto font-mono text-[8.5px]" style={{ color: "var(--fg-subtle)" }}>
          watching inbox — agent <span style={{ color: "var(--t2k-accent)" }}>#241</span>
        </div>
      </div>
    </Frame>
  );
}

function TerminalHeroPreview() {
  return (
    <Frame title="~/demo">
      <div className="flex h-full flex-col gap-1.5 font-mono text-[9.5px] leading-relaxed">
        <div style={{ color: "var(--fg-subtle)" }}>
          <span style={{ color: "var(--t2k-success)" }}>$</span> npm i -g @t2000/cli
        </div>
        <div style={{ color: "var(--fg-muted)" }}>added 1 package in 2s</div>
        <div style={{ color: "var(--fg-subtle)" }}>
          <span style={{ color: "var(--t2k-success)" }}>$</span> t2 init
          <span
            className="ml-1 inline-block"
            style={{ width: 5, height: 10, background: "var(--fg-muted)", verticalAlign: "-2px" }}
          />
        </div>
        <div style={{ color: "var(--t2k-success)" }}>✓ wallet created · agent id #241</div>
      </div>
    </Frame>
  );
}

function StackCardsPreview() {
  return (
    <Frame title="localhost:5173">
      <div className="relative h-full overflow-hidden">
        {[
          ["01 Fund", 0, "rgba(99,102,241,0.18)"],
          ["02 Deliver", 26, "rgba(52,211,153,0.16)"],
          ["03 Settle", 52, "rgba(251,191,36,0.14)"],
        ].map(([label, top, tint], i) => (
          <div
            className="absolute right-0 left-0 rounded-xl border p-3"
            key={label}
            style={{
              top: top as number,
              height: 84,
              background: `linear-gradient(135deg, ${tint} 0%, ${CHROME_BG} 55%)`,
              borderColor: "var(--ds-gray-alpha-400)",
              transform: `scale(${1 - (2 - i) * 0.045})`,
              transformOrigin: "top center",
            }}
          >
            <span className="text-[10px] font-semibold" style={{ color: "var(--fg)" }}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function RadialHeroPreview() {
  return (
    <Frame title="localhost:5173">
      <div className="relative flex h-full flex-col items-center justify-center gap-2 overflow-hidden">
        <div
          className="pointer-events-none absolute"
          style={{
            width: 240,
            height: 150,
            top: -16,
            background:
              "radial-gradient(46% 46% at 50% 40%, rgba(0,114,245,0.28) 0%, transparent 70%)",
            filter: "blur(12px)",
          }}
        />
        <div
          className="relative text-center text-[16px] font-extrabold leading-tight tracking-tight"
          style={{ color: "var(--fg)" }}
        >
          Hire an agent.
          <br />
          Pay on delivery.
        </div>
        <div
          className="relative mt-1 flex w-[82%] items-start justify-between rounded-lg border border-dashed px-2.5 py-2"
          style={{ borderColor: "var(--ds-gray-alpha-400)" }}
        >
          <span className="font-mono text-[7.5px] leading-relaxed" style={{ color: "var(--fg-muted)" }}>
            Browse agents.t2000.ai and hire one…
          </span>
          <span
            className="ml-2 shrink-0 rounded border px-1.5 py-0.5 text-[7px] uppercase"
            style={{ borderColor: "var(--ds-gray-alpha-400)", color: "var(--fg-subtle)" }}
          >
            Copy
          </span>
        </div>
      </div>
    </Frame>
  );
}

export function TemplateArt({ slug }: { slug: string }) {
  switch (slug) {
    case "aurora-landing":
      return <GlowHeroPreview line1="Ship your agent." line2="Not your weekend." />;
    case "founder-portfolio":
      return <PortfolioPreview />;
    case "wallet-app":
      return <PhonePreview />;
    case "market-brief-agent":
      return <BriefPreview />;
    case "selling-agent":
      return <SellingPreview />;
    case "terminal-hero":
      return <TerminalHeroPreview />;
    case "stack-cards":
      return <StackCardsPreview />;
    case "radial-hero":
      return <RadialHeroPreview />;
    default:
      // chat / agent-worker / sui-dapp keep their original template art.
      return <TemplatePreview slug={slug} />;
  }
}
