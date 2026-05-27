interface Tool {
  name: string;
  group: string;
}

const TOOLS: Tool[] = [
  { name: "balance", group: "wallet" },
  { name: "send", group: "wallet" },
  { name: "swap", group: "wallet" },
  { name: "pay", group: "payments" },
  { name: "services_search", group: "payments" },
  { name: "endpoint_quote", group: "payments" },
  { name: "pending_rewards", group: "navi" },
  { name: "harvest_rewards", group: "navi" },
  { name: "save_to_navi", group: "navi" },
  { name: "borrow", group: "navi" },
  { name: "supply_apy", group: "navi" },
  { name: "cetus_route", group: "cetus" },
  { name: "cetus_quote", group: "cetus" },
  { name: "lp_position", group: "cetus" },
  { name: "intent_create", group: "ptb" },
  { name: "intent_preview", group: "ptb" },
  { name: "intent_execute", group: "ptb" },
  { name: "tx_decode", group: "ptb" },
  { name: "object_owners", group: "sui" },
  { name: "domain_resolve", group: "sui" },
  { name: "price_history", group: "data" },
  { name: "portfolio_drift", group: "data" },
  { name: "yield_compare", group: "data" },
  { name: "address_label", group: "data" },
  { name: "watch", group: "stream" },
  { name: "explain", group: "stream" },
];

interface Guard {
  name: string;
  level: "block" | "warn" | "tap" | "log";
}

const GUARDS: Guard[] = [
  { name: "spending_limits", level: "block" },
  { name: "recipient_whitelist", level: "warn" },
  { name: "slippage_max", level: "block" },
  { name: "rate_limit", level: "block" },
  { name: "intent_expiry", level: "block" },
  { name: "balance_check", level: "block" },
  { name: "domain_verify", level: "warn" },
  { name: "approval_required", level: "tap" },
  { name: "destructive_confirm", level: "tap" },
  { name: "prompt_injection", level: "block" },
  { name: "tool_allow_list", level: "block" },
  { name: "audit_log", level: "log" },
];

const dotColor = (lvl: Guard["level"]) => {
  if (lvl === "block") return "var(--ds-red-700)";
  if (lvl === "warn") return "var(--ds-amber-700)";
  if (lvl === "tap") return "var(--t2k-accent)";
  return "var(--fg-subtle)";
};

export function EngineTools() {
  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <header className="mb-12 max-w-[720px]">
          <span className="t2k-eyebrow">{"// PRIMITIVES"}</span>
          <h2 className="t2k-section-title mt-[22px]">
            26 tools.
            <br />
            <span style={{ color: "var(--fg-muted)" }}>12 safety guards.</span>
          </h2>
          <p className="t2k-section-sub">
            Everything your agent needs. Already wired.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ToolsCard />
          <GuardsCard />
        </div>

        <p
          className="mt-5 font-mono text-[11.5px]"
          style={{
            color: "var(--fg-subtle)",
            letterSpacing: "0.01em",
          }}
        >
          {"// Names are illustrative — see the docs for the full list."}
        </p>
      </div>
    </section>
  );
}

function ToolsCard() {
  return (
    <div className="t2k-card flex flex-col overflow-hidden">
      <header
        className="flex items-center justify-between border-b px-[18px] py-[14px]"
        style={{ borderBottomColor: "var(--ds-gray-alpha-300)" }}
      >
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-[11px]"
            style={{
              color: "var(--fg-subtle)",
              letterSpacing: "0.06em",
            }}
          >
            01
          </span>
          <span
            className="block"
            style={{
              width: 1,
              height: 12,
              background: "var(--ds-gray-alpha-400)",
            }}
          />
          <span className="text-[14px] font-medium tracking-tight">
            The toolset
          </span>
        </div>
        <span className="t2k-eyebrow" style={{ fontSize: 10 }}>
          26 TOOLS
        </span>
      </header>

      <div
        className="grid grid-cols-2 font-mono text-[11.5px]"
        style={{
          padding: "16px 18px",
          gap: "4px 14px",
          color: "var(--fg-muted)",
        }}
      >
        {TOOLS.map((t) => (
          <div
            key={t.name}
            className="flex items-center justify-between border-b border-dotted"
            style={{
              padding: "4px 0",
              borderBottomColor: "var(--ds-gray-alpha-300)",
            }}
          >
            <span style={{ color: "var(--fg)" }}>{t.name}</span>
            <span
              className="text-[9.5px]"
              style={{
                color: "var(--fg-subtle)",
                letterSpacing: "0.06em",
              }}
            >
              {t.group.toUpperCase()}
            </span>
          </div>
        ))}
      </div>

      <div
        className="border-t"
        style={{
          padding: "14px 18px",
          borderTopColor: "var(--ds-gray-alpha-300)",
          background: "var(--ds-background-200)",
        }}
      >
        <div
          className="t2k-eyebrow mb-2"
          style={{ fontSize: 10 }}
        >
          SAMPLE DEFINITION
        </div>
        <pre
          className="m-0 whitespace-pre font-mono text-[11.5px] leading-[1.65]"
          style={{ color: "var(--fg)" }}
        >
          <span style={{ color: "var(--ds-blue-700)" }}>import</span>
          {" { "}
          <span style={{ color: "var(--ds-teal-700)" }}>tool</span>
          {" } "}
          <span style={{ color: "var(--ds-blue-700)" }}>from</span>
          {" "}
          <span style={{ color: "var(--t2k-success)" }}>{"'ai'"}</span>
          {";\n\n"}
          <span style={{ color: "var(--ds-blue-700)" }}>const</span>
          {" sendTool = "}
          <span style={{ color: "var(--ds-teal-700)" }}>tool</span>
          {"({\n  description: "}
          <span style={{ color: "var(--t2k-success)" }}>{"'Send USDC'"}</span>
          {",\n  parameters: z."}
          <span style={{ color: "var(--ds-teal-700)" }}>object</span>
          {"({ to, amount, asset }),\n  execute: ({ to, amount, asset }) =>\n    t."}
          <span style={{ color: "var(--ds-teal-700)" }}>send</span>
          {"({ to, amount, asset }),\n});"}
        </pre>
      </div>
    </div>
  );
}

function GuardsCard() {
  return (
    <div className="t2k-card flex flex-col overflow-hidden">
      <header
        className="flex items-center justify-between border-b px-[18px] py-[14px]"
        style={{ borderBottomColor: "var(--ds-gray-alpha-300)" }}
      >
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-[11px]"
            style={{
              color: "var(--fg-subtle)",
              letterSpacing: "0.06em",
            }}
          >
            02
          </span>
          <span
            className="block"
            style={{
              width: 1,
              height: 12,
              background: "var(--ds-gray-alpha-400)",
            }}
          />
          <span className="text-[14px] font-medium tracking-tight">
            The safety layer
          </span>
        </div>
        <span className="t2k-eyebrow" style={{ fontSize: 10 }}>
          12 GUARDS
        </span>
      </header>

      <div
        className="flex flex-col gap-1.5 font-mono text-[11.5px]"
        style={{
          padding: "16px 18px",
          color: "var(--fg-muted)",
        }}
      >
        {GUARDS.map((g) => (
          <div
            key={g.name}
            className="flex items-center justify-between border-b border-dotted"
            style={{
              padding: "5px 0",
              borderBottomColor: "var(--ds-gray-alpha-300)",
            }}
          >
            <div className="flex items-center gap-2.5">
              <span
                className="block h-1.5 w-1.5 rounded-full"
                style={{ background: dotColor(g.level) }}
              />
              <span style={{ color: "var(--fg)" }}>{g.name}</span>
            </div>
            <span
              className="text-[9.5px]"
              style={{
                color: "var(--fg-subtle)",
                letterSpacing: "0.06em",
              }}
            >
              {g.level.toUpperCase()}
            </span>
          </div>
        ))}
      </div>

      <div
        className="border-t"
        style={{
          padding: "14px 18px",
          borderTopColor: "var(--ds-gray-alpha-300)",
          background: "var(--ds-background-200)",
        }}
      >
        <div
          className="t2k-eyebrow mb-2"
          style={{ fontSize: 10 }}
        >
          EXAMPLE TRIP
        </div>
        <div
          className="font-mono text-[11.5px] leading-[1.65]"
          style={{ color: "var(--fg)" }}
        >
          <div>
            <span style={{ color: "var(--ds-red-700)" }}>✗</span>{" "}
            <span style={{ color: "var(--ds-amber-700)" }}>GUARD</span>{" "}
            <span style={{ color: "var(--fg)" }}>spending_limits</span>
          </div>
          <div
            className="pl-[18px] text-[11px]"
            style={{ color: "var(--fg-muted)" }}
          >
            attempted $310 · daily cap $200 · blocked
          </div>
          <div
            className="pl-[18px] text-[11px]"
            style={{ color: "var(--fg-muted)" }}
          >
            agent prompted to escalate to user.
          </div>
        </div>
      </div>
    </div>
  );
}
