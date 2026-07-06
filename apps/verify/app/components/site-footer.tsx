import {
  DEVELOPERS_URL,
  DISCORD_URL,
  GITHUB_URL,
  NAV_PRODUCTS,
  STORE_URL,
  TWITTER_URL,
} from "../data/site";

// Family footer (designer's SiteFooter) — brand mark only, product links
// absolute to t2000.ai.

interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

const PRODUCT_LINKS: FooterLink[] = NAV_PRODUCTS.map((p) => ({
  label: p.name,
  href: p.href,
}));

const FAMILY_LINKS: FooterLink[] = [
  { label: "Verify", href: "/" },
  { label: "x402 Gateway", href: "https://mpp.t2000.ai", external: true },
  { label: "Agent Store", href: STORE_URL, external: true },
  { label: "suimpp.dev", href: "https://suimpp.dev", external: true },
  { label: "Audric", href: "https://audric.ai", external: true },
  { label: "Developers", href: DEVELOPERS_URL, external: true },
];

const SOCIAL_LINKS = [
  { label: "GitHub", href: GITHUB_URL },
  { label: "Discord", href: DISCORD_URL },
  { label: "X", href: TWITTER_URL },
];

export function SiteFooter() {
  return (
    <footer
      className="border-t px-6"
      style={{
        borderTopColor: "var(--ds-gray-alpha-300)",
        padding: "56px 24px 28px",
      }}
    >
      <div className="t2k-container">
        <div className="mb-12 grid gap-12 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="mb-3.5 inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block text-[15px] font-bold leading-none text-foreground"
                style={{ letterSpacing: "-0.05em" }}
              >
                t2
              </span>
              <span
                className="pl-1.5 font-mono text-[13.5px] font-medium tracking-[0.02em] text-foreground"
                style={{ borderLeft: "1px solid var(--ds-gray-alpha-300)" }}
              >
                verify
              </span>
            </div>
            <p className="m-0 max-w-[300px] text-[13px] leading-[1.6] text-muted-foreground">
              Confidential AI, proven on Sui. Every confidential response is
              one paste away from proof.
            </p>
            <div className="mt-4 flex items-center gap-2.5 font-mono text-[12px] text-dim">
              <span className="t2k-dot" />
              <span>Sui mainnet</span>
            </div>
          </div>

          <FooterCol title="Products" links={PRODUCT_LINKS} />
          <FooterCol title="Family" links={FAMILY_LINKS} />
        </div>

        <hr className="t2k-rule" />

        <div className="flex flex-wrap items-center justify-between gap-6 pt-5">
          <div className="flex items-center gap-3.5 font-mono text-[12px] text-dim">
            <span>© 2026 t2000 AFI Inc.</span>
            <span className="opacity-40">·</span>
            <span>Built on Sui</span>
          </div>
          <div className="flex gap-4 text-[12px]">
            {SOCIAL_LINKS.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-dim no-underline transition-colors hover:text-foreground"
              >
                {s.label}
              </a>
            ))}
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
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {links.map((link) => (
          <li key={link.label}>
            <a
              href={link.href}
              {...(link.href.startsWith("http")
                ? { target: "_blank", rel: "noopener noreferrer" }
                : null)}
              className="inline-flex items-center gap-1.5 text-[13.5px] tracking-tight no-underline text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
              {link.external && <span className="opacity-55 text-[11px]">↗</span>}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
