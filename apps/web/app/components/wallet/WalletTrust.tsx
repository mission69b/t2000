interface Pillar {
  title: string;
  desc: string;
  artifact: { tag: string; value: string };
}

const PILLARS: Pillar[] = [
  {
    title: "Gasless USDC.",
    desc: "USDC and USDsui transfers cost nothing to send — a sponsor pays the gas. SUI and Cetus swaps still need ~0.05 SUI.",
    artifact: { tag: "SPONSORED PTB", value: "splitCoins → transferObjects · gas: sponsor" },
  },
  {
    title: "Non-custodial.",
    desc: "Keys live on the agent's machine. Never transmitted. Move between machines with one command.",
    artifact: { tag: "FILE", value: "~/.t2000/wallet.key · 0o600" },
  },
  {
    title: "Limits on by default.",
    desc: "Fresh wallets ship capped — $25 per transaction, $100 per day. Raise, lower, or clear them with one command.",
    artifact: { tag: "CLI", value: "t2 limit set --per-tx 50 --daily 200" },
  },
];

export function WalletTrust() {
  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <header className="mb-12">
          <span className="t2k-eyebrow">{"// SECURITY POSTURE"}</span>
          <h2 className="t2k-section-title mt-[22px]">
            How the wallet is safe.
          </h2>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {PILLARS.map((p) => (
            <div
              key={p.title}
              className="t2k-card flex flex-col gap-3"
              style={{ padding: "24px 22px" }}
            >
              <h3
                className="m-0 text-[20px] font-semibold"
                style={{
                  letterSpacing: "-0.022em",
                  color: "var(--fg)",
                }}
              >
                {p.title}
              </h3>
              <p
                className="m-0 text-[13.5px] leading-[1.55]"
                style={{ color: "var(--fg-muted)" }}
              >
                {p.desc}
              </p>

              <div
                className="mt-auto border-t border-dashed pt-3.5"
                style={{ borderTopColor: "var(--ds-gray-alpha-300)" }}
              >
                <div
                  className="t2k-eyebrow mb-1.5"
                  style={{ fontSize: 10 }}
                >
                  {p.artifact.tag}
                </div>
                <code
                  className="block rounded font-mono text-[11.5px]"
                  style={{
                    color: "var(--fg)",
                    background: "var(--ds-background-200)",
                    border: "1px solid var(--ds-gray-alpha-300)",
                    padding: "8px 10px",
                    wordBreak: "break-all",
                  }}
                >
                  {p.artifact.value}
                </code>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
