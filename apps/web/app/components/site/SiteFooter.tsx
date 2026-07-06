import Link from "next/link";
import {
  AUDRIC_URL,
  DEVELOPERS_URL,
  DISCORD_URL,
  GATEWAY_URL,
  GITHUB_URL,
  STORE_URL,
  SUIMPP_URL,
  TWITTER_URL,
} from "../../data/t2k";

interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
  soon?: boolean;
}

const PRODUCT_LINKS: FooterLink[] = [
  { label: "Agent Wallet", href: "/agent-wallet" },
  { label: "Agent Payments", href: "/agent-payments" },
  { label: "Agent SDK", href: "/agent-sdk" },
  { label: "Agent ID", href: "/agent-id" },
  { label: "Agent Commerce", href: "/agent-commerce" },
  { label: "Private API", href: "/private-api" },
];

const FAMILY_LINKS: FooterLink[] = [
  { label: "Verify", href: "/verify" },
  { label: "x402 Gateway", href: GATEWAY_URL, external: true },
  { label: "Agent Store", href: STORE_URL, external: true },
  { label: "suimpp.dev", href: SUIMPP_URL, external: true },
  { label: "Audric", href: AUDRIC_URL, external: true },
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
            </div>
            <p className="m-0 max-w-[300px] text-[13px] leading-[1.6] text-muted-foreground">
              The agent stack on Sui. Wallet, payments, identity, commerce —
              non-custodial, gasless, verifiable.
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
        {links.map((link) => {
          const isInternal = link.href.startsWith("/");
          const className =
            "inline-flex items-center gap-1.5 text-[13.5px] tracking-tight no-underline text-muted-foreground transition-colors hover:text-foreground";
          const soonPill = (
            <span
              className="font-mono uppercase"
              style={{
                fontSize: 9.5,
                letterSpacing: "0.06em",
                color: "var(--fg-subtle)",
                padding: "1px 5px",
                border: "1px solid var(--ds-gray-alpha-400)",
                borderRadius: 3,
              }}
            >
              Soon
            </span>
          );
          if (link.soon) {
            return (
              <li key={link.label}>
                <span
                  className="inline-flex items-center gap-1.5 text-[13.5px] tracking-tight"
                  style={{ color: "var(--fg-subtle)", opacity: 0.78 }}
                  aria-disabled="true"
                >
                  {link.label}
                  {soonPill}
                </span>
              </li>
            );
          }
          return (
            <li key={link.label}>
              {isInternal ? (
                <Link href={link.href} className={className}>
                  {link.label}
                </Link>
              ) : (
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={className}
                >
                  {link.label}
                  {link.external && (
                    <span className="opacity-55 text-[11px]">↗</span>
                  )}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
