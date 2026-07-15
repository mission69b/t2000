import { DEVELOPERS_URL } from "../../data/t2k";
import { Breadcrumb } from "../site/Breadcrumb";
import { HeroInstallButton } from "./HeroInstallButton";

export function WalletHero() {
  return (
    <section
      className="relative overflow-hidden border-b"
      style={{
        padding: "80px 0 64px",
        borderBottomColor: "var(--ds-gray-alpha-300)",
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          right: "-10%",
          top: "8%",
          width: 720,
          height: 540,
          background:
            "radial-gradient(45% 50% at 50% 50%, rgba(0,114,245,0.08) 0%, transparent 70%)",
          filter: "blur(24px)",
        }}
      />

      <div className="t2k-container relative">
        <Breadcrumb />

        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <div className="t2k-eyebrow mb-[22px]">
              {"// AGENT WALLET · @t2000/cli + @t2000/mcp"}
            </div>
            <h1
              className="t2k-display"
              style={{
                fontSize: "clamp(40px, 5.8vw, 76px)",
                color: "var(--fg)",
              }}
            >
              Send. Swap.
              <br />
              <span style={{ color: "var(--t2k-accent)" }}>Pay any API.</span>
            </h1>
            <p className="t2k-section-sub" style={{ marginTop: 26 }}>
              Your agent&rsquo;s wallet. Run it from your terminal, or wire it
              into Claude Desktop.
            </p>

            <div className="mt-8 flex flex-wrap gap-2.5">
              <HeroInstallButton />
              <a
                href={`${DEVELOPERS_URL}/agent-wallet`}
                target="_blank"
                rel="noopener noreferrer"
                className="t2k-btn t2k-btn--ghost t2k-btn--lg"
              >
                Read the docs&nbsp;↗
              </a>
            </div>

            <div
              className="mt-[22px] flex flex-wrap gap-3.5 font-mono text-[11px]"
              style={{
                color: "var(--fg-subtle)",
                letterSpacing: "0.02em",
              }}
            >
              <span>Node.js 18+</span>
              <span className="opacity-40">·</span>
              <span>macOS · Linux · Windows</span>
            </div>
          </div>

          <WalletHeroTerminal />
        </div>
      </div>
    </section>
  );
}

function WalletHeroTerminal() {
  return (
    <div
      className="overflow-hidden rounded-[10px] border"
      style={{
        background: "var(--ds-background-200)",
        borderColor: "var(--ds-gray-alpha-400)",
        boxShadow:
          "0 0 0 1px rgba(0,114,245,0.10), 0 24px 60px -20px rgba(0,114,245,0.20)",
      }}
    >
      <div
        className="flex items-center gap-2 border-b px-3.5 py-2.5"
        style={{
          borderBottomColor: "var(--ds-gray-alpha-300)",
          background: "var(--ds-gray-100)",
        }}
      >
        <span
          className="block h-2.5 w-2.5 rounded-full"
          style={{ background: "#FF5F57" }}
        />
        <span
          className="block h-2.5 w-2.5 rounded-full"
          style={{ background: "#FEBC2E" }}
        />
        <span
          className="block h-2.5 w-2.5 rounded-full"
          style={{ background: "#28C840" }}
        />
        <span
          className="ml-2.5 font-mono text-[12px] tracking-[0.01em]"
          style={{ color: "var(--fg-subtle)" }}
        >
          ~ /agent · zsh
        </span>
        <span className="flex-1" />
        <span className="t2k-dot" />
      </div>

      <pre
        className="m-0 whitespace-pre font-mono text-[12.5px] leading-[1.75]"
        style={{
          padding: "18px 16px 22px 18px",
          color: "var(--fg)",
        }}
      >
        <span style={{ color: "var(--fg-subtle)" }}>$ </span>npm install -g
        @t2000/cli{"\n"}
        <span style={{ color: "var(--fg-muted)" }}>
          added 28 packages in 3.2s
        </span>
        {"\n\n"}
        <span style={{ color: "var(--fg-subtle)" }}>$ </span>t2 init{"\n"}
        <span style={{ color: "var(--t2k-success)" }}>✓</span> Created wallet ·
        0x7a3b…f29c{"\n"}
        <span style={{ color: "var(--fg-subtle)" }}>{"  "}</span>
        ~/.t2000/wallet.key · 0o600{"\n\n"}
        <span style={{ color: "var(--fg-subtle)" }}>$ </span>t2 mcp install
        {"\n"}
        <span style={{ color: "var(--t2k-success)" }}>✓</span> Claude Desktop ·
        Cursor · Windsurf · ready{"\n\n"}
        <span style={{ color: "var(--fg-subtle)" }}>$ </span>t2 balance{"\n"}
        <span style={{ color: "var(--fg-subtle)" }}>{"  "}</span>USDC{"      "}
        547.20{"\n"}
        <span style={{ color: "var(--fg-subtle)" }}>{"  "}</span>USDsui{"     "}
        50.00{"\n\n"}
        <span style={{ color: "var(--fg-subtle)" }}>$ </span>t2 send 5 USDC
        alice.sui{"\n"}
        <span style={{ color: "var(--t2k-success)" }}>✓</span> Sent · gasless ·
        0.41s
      </pre>
    </div>
  );
}
