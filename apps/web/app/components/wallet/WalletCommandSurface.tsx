// "More than a wallet" — the full command surface as three capability lanes.
// Money is the core; the same t2 CLI drives identity and inference.
interface Lane {
  n: string;
  title: string;
  core?: boolean;
  verbs: string[];
  desc: string;
}

const LANES: Lane[] = [
  {
    n: "01",
    title: "Money",
    core: true,
    verbs: ["t2 send", "swap", "pay"],
    desc: "Hold and move USDC + USDsui gasless, swap any Sui token via Cetus, and pay any API per call over x402.",
  },
  {
    n: "02",
    title: "Identity",
    verbs: ["t2 agent"],
    desc: "Register an Agent ID, claim an @handle, set a public profile, and link an owner — every command sponsored, gasless.",
  },
  {
    n: "03",
    title: "Inference",
    verbs: ["t2 models", "verify"],
    desc: "The Private Inference catalog plus trustless on-chain receipt verification. Interactive chat lives in t2 code.",
  },
];

export function WalletCommandSurface() {
  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <header className="mb-11">
          <span className="t2k-eyebrow">{"// THE COMMAND SURFACE"}</span>
          <h2 className="t2k-section-title mt-3">
            One wallet. Money, identity, inference.
          </h2>
          <p className="t2k-section-sub">
            Money is the core — everything else runs from the same{" "}
            <code className="font-mono" style={{ color: "var(--fg)" }}>t2</code>,
            and every command is{" "}
            <code className="font-mono" style={{ color: "var(--fg)" }}>--json</code>
            -scriptable.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {LANES.map((l) => (
            <div
              key={l.n}
              className="t2k-card relative flex flex-col gap-3.5"
              style={{
                padding: "22px 22px 20px",
                borderColor: l.core ? "rgba(0,114,245,0.35)" : undefined,
              }}
            >
              <div className="flex items-baseline justify-between">
                <span className="inline-flex items-baseline gap-3">
                  <span
                    className="font-mono text-[11px]"
                    style={{ color: "var(--fg-subtle)", letterSpacing: "0.06em" }}
                  >
                    {l.n}
                  </span>
                  <span
                    className="text-[18px] font-semibold"
                    style={{ color: "var(--fg)", letterSpacing: "-0.02em" }}
                  >
                    {l.title}
                  </span>
                </span>
                {l.core && (
                  <span
                    className="t2k-eyebrow"
                    style={{ fontSize: 9.5, color: "var(--t2k-accent)" }}
                  >
                    CORE
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {l.verbs.map((v) => (
                  <code
                    key={v}
                    className="rounded-[5px] border font-mono text-[12px]"
                    style={{
                      color: l.core ? "var(--t2k-accent)" : "var(--fg)",
                      background: "var(--ds-gray-alpha-100)",
                      borderColor: "var(--border)",
                      padding: "3px 8px",
                    }}
                  >
                    {v}
                  </code>
                ))}
              </div>

              <p
                className="m-0 text-[13.5px] leading-[1.55]"
                style={{ color: "var(--fg-muted)", letterSpacing: "-0.011em" }}
              >
                {l.desc}
              </p>
            </div>
          ))}

          <div
            className="flex flex-col justify-center gap-2.5 rounded-xl border border-dashed"
            style={{
              padding: "22px 22px 20px",
              borderColor: "var(--border)",
            }}
          >
            <div className="t2k-eyebrow" style={{ fontSize: 10 }}>
              {"// SAME CAPABILITIES, TWO MORE SHAPES"}
            </div>
            <p
              className="m-0 text-[13.5px] leading-[1.6]"
              style={{ color: "var(--fg-muted)", letterSpacing: "-0.011em" }}
            >
              <b style={{ color: "var(--fg)" }}>MCP server</b> exposes every verb
              as a tool for Claude Desktop, Cursor &amp; Windsurf.{" "}
              <b style={{ color: "var(--fg)" }}>Skills</b> are the playbooks your
              agent reads on demand.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
