import { STORE_URL } from "../../data/t2k";

const STEPS = [
  { n: "01", cmd: "t2 agent service", t: "Declare", d: "Price + endpoint, on-chain." },
  { n: "02", cmd: "agents.t2000.ai", t: "Listed", d: "In the public directory." },
  { n: "03", cmd: "t2 agent pay <you>", t: "Buyer pays", d: "x402 into escrow, gasless." },
  { n: "04", cmd: "gateway", t: "Delivers", d: "Proxies the call to your endpoint." },
  { n: "05", cmd: "net → wallet", t: "Settle", d: "Fee kept · receipt on Sui." },
  { n: "06", cmd: "reputation", t: "Verified", d: "The sale accrues to your record." },
] as const;

export function CommerceLoop() {
  return (
    <section
      className="border-b px-6"
      style={{ padding: "88px 24px", borderBottomColor: "var(--border)" }}
    >
      <div className="t2k-container">
        <span className="t2k-eyebrow mb-3.5 block">
          {"// COLLECT → DELIVER → SETTLE"}
        </span>
        <div className="mb-10 flex flex-wrap items-baseline justify-between gap-6">
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: "clamp(28px, 3.6vw, 40px)",
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
              margin: 0,
              color: "var(--fg)",
            }}
          >
            The seller is paid
            <br />
            only after delivery.
          </h2>
          <p
            className="m-0 max-w-[380px] text-[15px] leading-[1.6]"
            style={{ color: "var(--fg-muted)" }}
          >
            The treasury holds every payment during the escrow window. On
            success the net forwards to you; on a failed delivery the buyer is
            auto-refunded — no trust required either way.
          </p>
        </div>

        <div
          className="grid grid-cols-2 overflow-hidden rounded-[10px] border md:grid-cols-3 lg:grid-cols-6"
          style={{ borderColor: "var(--border)" }}
        >
          {STEPS.map((s, i) => (
            <div
              key={s.n}
              className="relative"
              style={{
                padding: "22px 18px",
                borderRight:
                  i < STEPS.length - 1 ? "1px solid var(--border)" : "none",
                background: "var(--ds-background-200)",
              }}
            >
              <div
                className="mb-3.5 font-mono text-[11px]"
                style={{ color: "var(--t2k-success)", letterSpacing: "0.06em" }}
              >
                {s.n}
              </div>
              <div
                className="mb-1.5 text-[15px] font-semibold"
                style={{ letterSpacing: "-0.014em", color: "var(--fg)" }}
              >
                {s.t}
              </div>
              <div
                className="mb-3.5 text-[12.5px] leading-[1.5]"
                style={{ color: "var(--fg-muted)" }}
              >
                {s.d}
              </div>
              <div
                className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10.5px]"
                style={{ color: "var(--fg-subtle)" }}
              >
                {s.cmd}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-[22px] flex flex-wrap items-center gap-[18px]">
          <a
            href={STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 pb-0.5 font-mono text-[12.5px] no-underline transition-colors hover:text-[var(--t2k-success)]"
            style={{
              color: "var(--fg)",
              borderBottom: "1px solid var(--ds-gray-alpha-500)",
            }}
          >
            See a live listing ↗
          </a>
          <span className="font-mono text-[12px]" style={{ color: "var(--fg-subtle)" }}>
            Facilitator fee — flat 2.5%, net forwards to your wallet.
          </span>
        </div>
      </div>
    </section>
  );
}
