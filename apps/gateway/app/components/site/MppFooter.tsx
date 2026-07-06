interface FooterLink {
  l: string;
  href: string;
  external?: boolean;
}

const GATEWAY_LINKS: FooterLink[] = [
  { l: "Services", href: "/services" },
  { l: "Activity", href: "/activity" },
  { l: "GitHub", href: "https://github.com/mission69b/t2000", external: true },
];

const FAMILY_LINKS: FooterLink[] = [
  { l: "t2000.ai", href: "https://t2000.ai", external: true },
  { l: "suimpp.dev", href: "https://suimpp.dev", external: true },
  { l: "Audric", href: "https://audric.ai", external: true },
];

export function MppFooter({ serviceCount, endpointCount }: { serviceCount: number; endpointCount: number }) {
  return (
    <footer
      className="px-6 pb-7 pt-12"
      style={{ borderTop: "1px solid var(--ds-gray-alpha-300)" }}
    >
      <div className="t2k-container">
        <div className="mb-9 grid gap-10 md:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <div className="mb-3.5 inline-flex items-center gap-2">
              <span className="text-[14px] font-semibold tracking-[-0.022em]">
                t2000
              </span>
              <span
                className="pl-1.5 font-mono text-[13.5px] font-medium tracking-[0.02em]"
                style={{ borderLeft: "1px solid var(--ds-gray-alpha-300)" }}
              >
                mpp
              </span>
            </div>
            <p
              className="m-0 max-w-[320px] text-[13px] leading-[1.6]"
              style={{ color: "var(--fg-muted)" }}
            >
              The x402 gateway. {serviceCount} services. {endpointCount} endpoints. Pay-per-request in USDC on Sui.
            </p>

            <a
              href="https://suimpp.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-[18px] inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] no-underline transition-colors hover:!text-foreground"
              style={{
                background: "var(--ds-gray-alpha-100)",
                borderColor: "var(--ds-gray-alpha-400)",
                color: "var(--fg-muted)",
                letterSpacing: "-0.011em",
              }}
            >
              <span
                className="font-mono text-[10px] tracking-[0.06em]"
                style={{ color: "var(--t2k-accent)" }}
              >
                OPEN STANDARD
              </span>
              <span
                className="inline-block"
                style={{ width: 1, height: 11, background: "var(--ds-gray-alpha-400)" }}
              />
              <span className="font-mono text-[12px]">suimpp.dev</span>
              <span className="opacity-55">↗</span>
            </a>
          </div>

          <FooterCol title="Gateway" links={GATEWAY_LINKS} />
          <FooterCol title="Family" links={FAMILY_LINKS} />
        </div>

        <hr className="t2k-rule" />

        <div
          className="flex flex-wrap items-center justify-between gap-6 pt-5 font-mono text-[12px]"
          style={{ color: "var(--fg-subtle)" }}
        >
          <div className="flex items-center gap-3.5">
            <span>© 2026 t2000 AFI Inc.</span>
            <span className="opacity-40">·</span>
            <span>x402 gateway · Sui mainnet</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div>
      <div className="t2k-eyebrow mb-4" style={{ fontSize: 11 }}>
        {title}
      </div>
      <ul className="m-0 flex list-none flex-col gap-[11px] p-0">
        {links.map((l) => {
          const internal = l.href.startsWith("/");
          const cls =
            "inline-flex items-center gap-1 text-[13.5px] tracking-[-0.011em] no-underline transition-colors hover:!text-foreground";
          const style = { color: "var(--fg-muted)" };
          const inner = (
            <>
              {l.l}
              {l.external && <span className="text-[11px] opacity-55">↗</span>}
            </>
          );
          return (
            <li key={l.l}>
              {internal ? (
                <a href={l.href} className={cls} style={style}>
                  {inner}
                </a>
              ) : (
                <a
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cls}
                  style={style}
                >
                  {inner}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
