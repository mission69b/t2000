import { MppInstallButton } from "./MppInstallButton";
import { MppHeroActivity } from "./MppHeroActivity";

export function MppHero() {
  return (
    <section
      className="relative overflow-hidden"
      style={{
        padding: "80px 0 64px",
        borderBottom: "1px solid var(--ds-gray-alpha-300)",
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
            "radial-gradient(45% 50% at 50% 50%, rgba(18,165,148,0.10) 0%, transparent 70%)",
          filter: "blur(24px)",
        }}
      />

      <div className="t2k-container relative">
        <div className="grid items-center gap-10 lg:gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div>
            <span
              className="t2k-eyebrow inline-block"
              style={{ marginBottom: 22 }}
            >
              // PAY-PER-REQUEST · LIVE
            </span>
            <h1
              className="t2k-display"
              style={{
                fontSize: "clamp(40px, 5.8vw, 76px)",
                color: "var(--fg)",
                marginTop: 6,
              }}
            >
              Pay-per-request APIs
              <br />
              <span style={{ color: "var(--t2k-accent)" }}>on Sui. Gasless.</span>
            </h1>
            <p
              className="max-w-[540px]"
              style={{
                fontSize: 19,
                lineHeight: 1.5,
                color: "var(--fg-muted)",
                margin: "26px 0 0",
                letterSpacing: "-0.014em",
              }}
            >
              No API keys. No accounts. No subscriptions. No gas. Your agent pays per request with USDC.
            </p>

            <div className="mt-8 flex flex-wrap gap-2.5 sm:flex-nowrap">
              <MppInstallButton />
              <a
                href="/services"
                className="t2k-btn t2k-btn--ghost t2k-btn--lg"
              >
                Browse services
              </a>
            </div>
          </div>

          <MppHeroActivity />
        </div>
      </div>
    </section>
  );
}
