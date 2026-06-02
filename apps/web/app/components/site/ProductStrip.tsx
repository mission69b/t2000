import Link from "next/link";

const PRODUCTS = [
  { slug: "wallet", name: "Agent Wallet", pkg: "@t2000/cli", href: "/agent-wallet" },
  { slug: "payments", name: "Agent Payments", pkg: "@suimpp/mpp", href: "/agent-payments" },
  { slug: "sdk", name: "Agent SDK", pkg: "@t2000/sdk", href: "/agent-sdk" },
  { slug: "engine", name: "Agent Engine", pkg: "@t2000/engine", href: "/agent-engine" },
] as const;

type Slug = (typeof PRODUCTS)[number]["slug"];

export function ProductStrip({ currentPage }: { currentPage?: Slug }) {
  return (
    <section
      className="border-t"
      style={{
        padding: "72px 24px",
        borderTopColor: "var(--ds-gray-alpha-300)",
      }}
    >
      <div className="t2k-container">
        <span className="t2k-eyebrow mb-3.5 block">{"// PART OF THE STACK"}</span>
        <h2
          className="mt-0 mb-9"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: "clamp(28px, 3.6vw, 40px)",
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
            color: "var(--fg)",
          }}
        >
          One agent stack.
        </h2>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {PRODUCTS.map((p) => {
            const active = p.slug === currentPage;
            const className =
              "group flex flex-col rounded-lg border p-[20px_18px] no-underline transition-colors";

            const activeStyle = {
              background: "var(--ds-gray-alpha-100)",
              borderColor: "var(--ds-gray-alpha-500)",
              color: "var(--fg-muted)",
              cursor: "default",
              pointerEvents: "none" as const,
            };

            const inner = (
              <>
                <div className="mb-1.5 flex items-center justify-between">
                  <span
                    className="font-mono text-[10.5px]"
                    style={{
                      color: "var(--fg-subtle)",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {p.pkg}
                  </span>
                  {active ? (
                    <span
                      className="font-mono text-[10px]"
                      style={{
                        color: "var(--t2k-accent)",
                        letterSpacing: "0.06em",
                      }}
                    >
                      YOU&rsquo;RE HERE
                    </span>
                  ) : (
                    <span
                      className="text-[13px]"
                      style={{ color: "var(--fg-subtle)" }}
                    >
                      →
                    </span>
                  )}
                </div>
                <span
                  className="text-[17px] font-semibold"
                  style={{ letterSpacing: "-0.018em" }}
                >
                  {p.name}
                </span>
              </>
            );

            if (active) {
              return (
                <div
                  key={p.slug}
                  className={className}
                  style={activeStyle}
                  aria-current="page"
                >
                  {inner}
                </div>
              );
            }
            return (
              <Link
                key={p.slug}
                href={p.href}
                className={
                  className +
                  " border-[color:var(--ds-gray-alpha-400)] hover:border-accent hover:bg-accent/[0.08]"
                }
                style={{ color: "var(--fg)" }}
              >
                {inner}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
