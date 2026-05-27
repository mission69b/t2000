import type { ReactNode } from "react";

export function WalletSurfaces() {
  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <header className="mb-12">
          <span className="t2k-eyebrow">{"// TWO SURFACES"}</span>
          <h2 className="t2k-section-title mt-3">
            Drive it from a terminal,
            <br />
            <span style={{ color: "var(--fg-muted)" }}>
              or from Claude Desktop.
            </span>
          </h2>
          <p className="t2k-section-sub">
            The same keys, the same gasless rails. One{" "}
            <code
              className="font-mono"
              style={{ color: "var(--fg)" }}
            >
              t2 mcp install
            </code>{" "}
            wires the wallet into any MCP-aware AI client.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <WalletCardCLI />
          <WalletCardClaude />
        </div>
      </div>
    </section>
  );
}

function WalletCardShell({
  num,
  title,
  label,
  footer,
  children,
}: {
  num: string;
  title: string;
  label: string;
  footer: string;
  children: ReactNode;
}) {
  return (
    <div className="t2k-card flex flex-col">
      <header
        className="flex items-center justify-between border-b px-[18px] py-[14px]"
        style={{ borderBottomColor: "var(--ds-gray-alpha-300)" }}
      >
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-[11px]"
            style={{ color: "var(--fg-subtle)", letterSpacing: "0.06em" }}
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
          <span className="text-[14px] font-medium tracking-tight">{title}</span>
        </div>
        <span className="t2k-eyebrow" style={{ fontSize: 10 }}>
          {label}
        </span>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
      <footer
        className="border-t px-[18px] py-3 font-mono text-[11.5px]"
        style={{
          borderTopColor: "var(--ds-gray-alpha-300)",
          color: "var(--fg-subtle)",
          letterSpacing: "0.01em",
        }}
      >
        {footer}
      </footer>
    </div>
  );
}

function WalletCardCLI() {
  return (
    <WalletCardShell num="01" title="From your terminal" label="CLI" footer="@t2000/cli">
      <pre
        className="m-0 flex-1 overflow-hidden whitespace-pre font-mono text-[13px] leading-[1.85]"
        style={{
          padding: "22px 20px",
          background: "var(--ds-background-200)",
          color: "var(--fg)",
          minHeight: 280,
        }}
      >
        <span style={{ color: "var(--fg-subtle)" }}>$ </span>t2 send 10 USDC
        alice.sui{"\n"}
        <span style={{ color: "var(--t2k-success)" }}>✓</span> Sent · gasless ·
        0.41s{"\n\n"}
        <span style={{ color: "var(--fg-subtle)" }}>$ </span>t2 swap 50 SUI{" "}
        <span style={{ color: "var(--fg-subtle)" }}>→</span> USDC{"\n"}
        <span style={{ color: "var(--t2k-success)" }}>✓</span> Swapped on Cetus
        · 200ms{"\n\n"}
        <span style={{ color: "var(--fg-subtle)" }}>$ </span>t2 pay
        mpp.t2000.ai/openai/v1/chat{"\n"}
        <span style={{ color: "var(--t2k-success)" }}>✓</span> Paid $0.012 ·
        gasless · 200 OK
      </pre>
    </WalletCardShell>
  );
}

function WalletCardClaude() {
  return (
    <WalletCardShell
      num="02"
      title="Inside Claude Desktop"
      label="MCP"
      footer="@t2000/mcp"
    >
      <div
        className="flex flex-1 flex-col gap-3 p-5"
        style={{ background: "var(--ds-gray-100)", minHeight: 280 }}
      >
        <Bubble side="right">
          Send $10 USDC to alice.sui and grab the latest SUI price.
        </Bubble>
        <ToolTrace
          lines={[
            { tool: "t2000_send → alice.sui", cost: "$10" },
            { tool: "t2000_pay → coingecko", cost: "$0.001" },
          ]}
          note="one Payment Intent · gasless"
        />
        <Bubble side="left">
          <span style={{ color: "var(--t2k-success)", marginRight: 6 }}>✓</span>
          Sent <b>$10</b> to alice.sui · SUI is <b>$4.21</b>.
        </Bubble>
      </div>
    </WalletCardShell>
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
      className="text-[13.5px] leading-[1.5]"
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: "92%",
        padding: "11px 14px",
        borderRadius: 10,
        letterSpacing: "-0.011em",
        background: isUser ? "var(--ds-gray-200)" : "var(--ds-background-200)",
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
      className="flex flex-col gap-0.5 pl-1 font-mono text-[12px] leading-[1.7]"
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
