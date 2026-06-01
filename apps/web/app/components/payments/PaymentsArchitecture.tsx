import { DEVELOPERS_URL, GATEWAY_URL, SUIMPP_URL } from "../../data/t2k";

interface Property {
  url: string;
  href: string;
  role: string;
  title: string;
  desc: string;
  cta: string;
  standard?: boolean;
}

const PROPERTIES: Property[] = [
  {
    url: "mpp.t2000.ai",
    href: GATEWAY_URL,
    role: "GATEWAY",
    title: "The live gateway.",
    desc: "Browse the full catalog, real activity.",
    cta: "Open the gateway",
  },
  {
    url: "suimpp.dev",
    href: SUIMPP_URL,
    role: "STANDARD",
    title: "The open standard.",
    desc: "MPP is an open spec. Anyone can implement a gateway.",
    cta: "Read the spec",
    standard: true,
  },
  {
    url: "developers.t2000.ai",
    href: `${DEVELOPERS_URL}/agent-payments`,
    role: "DOCS",
    title: "The developer docs.",
    desc: "Full reference for @suimpp/mpp + recipes.",
    cta: "Read the docs",
  },
];

export function PaymentsArchitecture() {
  return (
    <section
      className="border-t border-b"
      style={{
        padding: "80px 0",
        borderTopColor: "var(--ds-gray-alpha-300)",
        borderBottomColor: "var(--ds-gray-alpha-300)",
        background: "var(--ds-background-200)",
      }}
    >
      <div className="t2k-container">
        <header className="mb-8 max-w-[720px]">
          <span className="t2k-eyebrow">{"// ARCHITECTURE"}</span>
          <h2
            className="m-0 mt-[22px] text-[28px] leading-[1.15]"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              letterSpacing: "-0.022em",
              color: "var(--fg)",
            }}
          >
            <span style={{ color: "var(--fg-muted)" }}>One stack.</span>
          </h2>
        </header>

        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
          {PROPERTIES.map((p) => (
            <a
              key={p.url}
              href={p.href}
              target="_blank"
              rel="noopener noreferrer"
              className="t2k-card t2k-card-hover flex flex-col gap-3.5 no-underline"
              style={{
                padding: "22px 22px 18px",
                color: "var(--fg)",
                background: "var(--bg-elevated)",
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="font-mono text-[13px]"
                  style={{
                    color: "var(--fg)",
                    letterSpacing: "0.01em",
                  }}
                >
                  {p.url}
                </span>
                <span
                  className="t2k-eyebrow"
                  style={{
                    fontSize: 10,
                    color: p.standard
                      ? "var(--t2k-accent)"
                      : "var(--fg-subtle)",
                  }}
                >
                  {p.role}
                </span>
              </div>

              <div
                className="block h-px"
                style={{ background: "var(--ds-gray-alpha-300)" }}
              />

              <div
                className="text-[18px] font-semibold leading-tight"
                style={{ letterSpacing: "-0.022em" }}
              >
                {p.title}
              </div>

              <p
                className="m-0 text-[13.5px] leading-[1.5]"
                style={{ color: "var(--fg-muted)" }}
              >
                {p.desc}
              </p>

              <div className="flex-1" />

              <div
                className="inline-flex items-center gap-1 text-[13px] font-medium tracking-tight"
                style={{
                  color: p.standard ? "var(--t2k-accent)" : "var(--fg)",
                }}
              >
                {p.cta} <span className="opacity-60">↗</span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
