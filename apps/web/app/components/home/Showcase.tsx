import type { ReactNode } from "react";

export function Showcase() {
  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <div className="mb-14 text-center">
          <span className="t2k-eyebrow">{"// ONE STACK · THREE SURFACES"}</span>
          <h2 className="t2k-section-title mt-[22px]">
            From your terminal,
            <br />
            to Claude, to{" "}
            <span style={{ color: "var(--t2k-accent)" }}>Audric</span>.
          </h2>
          <p className="t2k-section-sub t2k-section-sub--center">
            The same engine and Sui rails, three ways to use it.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <CardCLI />
          <CardClaude />
          <CardAudric />
        </div>
      </div>
    </section>
  );
}

function ShowcaseCardShell({
  num,
  title,
  label,
  footer,
  destination,
  children,
}: {
  num: string;
  title: string;
  label: string;
  footer: string;
  destination?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className="t2k-card flex flex-col"
      style={{
        borderColor: destination
          ? "rgba(0,114,245,0.30)"
          : "var(--ds-gray-alpha-400)",
      }}
    >
      <header
        className="flex items-center justify-between border-b px-[18px] py-[14px]"
        style={{ borderBottomColor: "var(--ds-gray-alpha-300)" }}
      >
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-[11px]"
            style={{
              color: destination ? "var(--t2k-accent)" : "var(--fg-subtle)",
              letterSpacing: "0.06em",
            }}
          >
            {num}
          </span>
          <span
            className="block"
            style={{
              width: 1,
              height: 12,
              background: "var(--ds-gray-alpha-400)",
            }}
          />
          <span className="text-[13.5px] font-medium tracking-tight">
            {title}
          </span>
        </div>
        <span
          className={
            "t2k-mono-tag" + (destination ? " t2k-mono-tag--blue" : "")
          }
          style={{ fontSize: 10, padding: "2px 8px" }}
        >
          {label}
        </span>
      </header>

      <div className="flex flex-1 flex-col">{children}</div>

      <footer
        className="flex items-center justify-between border-t px-[18px] py-3 font-mono text-[11.5px]"
        style={{
          borderTopColor: "var(--ds-gray-alpha-300)",
          color: destination ? "var(--t2k-accent)" : "var(--fg-subtle)",
          letterSpacing: "0.01em",
        }}
      >
        <span>{footer}</span>
        {destination && (
          <span style={{ color: "var(--t2k-accent)" }}>audric.ai ↗</span>
        )}
      </footer>
    </div>
  );
}

function CardCLI() {
  return (
    <ShowcaseCardShell
      num="01"
      title="From your terminal"
      label="CLI"
      footer="@t2000/cli"
    >
      <pre
        className="m-0 flex-1 overflow-hidden whitespace-pre font-mono text-[12.5px] leading-[1.75]"
        style={{
          padding: "20px 18px",
          background: "var(--ds-background-200)",
          color: "var(--fg)",
        }}
      >
        <span style={{ color: "var(--fg-subtle)" }}>$ </span>t2 balance{"\n"}
        {"  "}
        <span style={{ color: "var(--fg-muted)" }}>USDC</span>
        {"      "}
        <span className="t2k-tabular">547.20</span>
        {"\n"}
        {"  "}
        <span style={{ color: "var(--fg-muted)" }}>USDsui</span>
        {"     "}
        <span className="t2k-tabular"> 50.00</span>
        {"\n\n"}
        <span style={{ color: "var(--fg-subtle)" }}>$ </span>t2 pay
        https://mpp.t2000.ai/coingecko/{"\n"}
        {"    "}v1/price?ids=sui&vs_currencies=usd{"\n"}
        <span style={{ color: "var(--t2k-success)" }}>✓</span> Paid $0.001 ·
        gasless · 200 OK{"\n\n"}
        <span style={{ color: "var(--fg-subtle)" }}>$ </span>t2 send 5 USDC
        alice.sui{"\n"}
        <span style={{ color: "var(--t2k-success)" }}>✓</span> Sent · gasless ·
        0.41s
      </pre>
    </ShowcaseCardShell>
  );
}

function CardClaude() {
  return (
    <ShowcaseCardShell
      num="02"
      title="Inside Claude Desktop · Cursor"
      label="MCP"
      footer="@t2000/mcp"
    >
      <div
        className="flex flex-1 flex-col gap-2 p-4"
        style={{ background: "var(--ds-gray-100)" }}
      >
        <Bubble side="right">
          Pull SUI, ETH, BTC prices and write me a 200-word morning brief.
        </Bubble>
        <ToolTrace
          lines={[
            { tool: "t2000_pay → coingecko", cost: "$0.001" },
            { tool: "t2000_pay → newsapi", cost: "$0.004" },
            { tool: "t2000_pay → anthropic", cost: "$0.015" },
          ]}
        />
        <Bubble side="left">
          <span style={{ color: "var(--t2k-success)", marginRight: 6 }}>✓</span>
          Brief saved · <b>~$0.02</b> · gasless · 5s
        </Bubble>
      </div>
    </ShowcaseCardShell>
  );
}

function CardAudric() {
  return (
    <ShowcaseCardShell
      num="03"
      title="Powering Audric"
      label="SDK + ENGINE"
      footer="@t2000/sdk · @t2000/engine"
      destination
    >
      <div
        className="flex flex-1 flex-col gap-2 p-4"
        style={{ background: "var(--ds-gray-100)" }}
      >
        <Bubble side="right">
          Compound my NAVI rewards and send $20 to Sam.
        </Bubble>
        <ToolTrace
          lines={[
            { tool: "pending_rewards", cost: "" },
            { tool: "harvest_rewards", cost: "1 PTB" },
            { tool: "send → sam.sui", cost: "$20" },
          ]}
          note="claim → swap → save → send · one Payment Intent"
        />
        <div
          className="rounded-md border border-dashed text-center font-mono text-[11px]"
          style={{
            padding: "9px 12px",
            background: "var(--ds-gray-alpha-100)",
            borderColor: "var(--ds-gray-alpha-500)",
            letterSpacing: "0.06em",
            color: "var(--fg)",
          }}
        >
          [ tap to confirm via Passport ]
        </div>
        <Bubble side="left">
          <span style={{ color: "var(--t2k-success)", marginRight: 6 }}>✓</span>
          Compounded <b>$42</b> · sent <b>$20</b> · 1 tap · 12s
        </Bubble>
      </div>
    </ShowcaseCardShell>
  );
}

function Bubble({
  side,
  children,
}: {
  side: "left" | "right";
  children: ReactNode;
}) {
  const isUser = side === "right";
  return (
    <div
      className="text-[12.5px] leading-[1.5]"
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: "92%",
        padding: "9px 12px",
        borderRadius: 10,
        background: isUser
          ? "var(--ds-gray-200)"
          : "var(--ds-background-200)",
        color: "var(--fg)",
        border: isUser
          ? "1px solid var(--ds-gray-alpha-300)"
          : "1px solid var(--ds-gray-alpha-400)",
      }}
    >
      {children}
    </div>
  );
}

function ToolTrace({
  lines,
  note,
}: {
  lines: { tool: string; cost: string }[];
  note?: string;
}) {
  return (
    <div
      className="flex flex-col gap-0.5 pl-1 font-mono text-[11.5px] leading-[1.7]"
      style={{ color: "var(--fg-muted)" }}
    >
      {lines.map((l, i) => (
        <div key={i} className="flex justify-between gap-3">
          <span>
            <span style={{ color: "var(--t2k-accent)", marginRight: 6 }}>▸</span>
            {l.tool}
          </span>
          {l.cost && (
            <span
              className="t2k-tabular"
              style={{ color: "var(--fg-subtle)" }}
            >
              {l.cost}
            </span>
          )}
        </div>
      ))}
      {note && (
        <div
          className="pl-3.5 text-[11px]"
          style={{ color: "var(--fg-subtle)" }}
        >
          {note}
        </div>
      )}
    </div>
  );
}
