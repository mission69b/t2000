import Link from "next/link";
import {
  AGENTS_URL,
  DEVELOPERS_URL,
  NAV_LINKS,
  type ProductSlug,
} from "../../data/t2k";

// Flat nav (dead-simple pass, 2026-07-20) — four links, no dropdown. The
// full site map lives in the footer; currentPage just highlights a link.
type CurrentPage = ProductSlug | null;

const linkBase =
  "inline-flex items-center gap-1 text-[13px] font-medium tracking-tight whitespace-nowrap transition-colors cursor-pointer no-underline text-muted-foreground hover:text-foreground";

export function Nav({ currentPage = null }: { currentPage?: CurrentPage }) {
  return (
    <nav
      className="sticky top-0 z-30 border-b backdrop-blur-md backdrop-saturate-150"
      style={{
        background: "rgba(10,10,10,0.72)",
        borderBottomColor: "var(--ds-gray-alpha-300)",
      }}
    >
      <div
        className="relative mx-auto flex h-[60px] items-center gap-6 px-6"
        style={{ maxWidth: "var(--t2k-page-max)" }}
      >
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-foreground no-underline"
          aria-label="t2000 — home"
        >
          <span
            aria-hidden="true"
            className="inline-block text-[20px] font-bold leading-none"
            style={{ letterSpacing: "-0.05em" }}
          >
            t2
          </span>
        </Link>

        <div className="ml-2 flex items-center gap-[18px]">
          {NAV_LINKS.map((l) => {
            const active = l.slug === currentPage;
            const style = active ? { color: "var(--fg)" } : undefined;
            if (l.href.startsWith("/")) {
              return (
                <Link
                  key={l.slug}
                  href={l.href}
                  className={linkBase}
                  style={style}
                  aria-current={active ? "page" : undefined}
                >
                  {l.label}
                </Link>
              );
            }
            return (
              <a
                key={l.slug}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className={linkBase}
                style={style}
              >
                {l.label}
              </a>
            );
          })}
        </div>

        <span className="flex-1" />

        <a
          href={DEVELOPERS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={linkBase + " hidden md:inline-flex"}
        >
          Developers
        </a>

        <a
          href={`${AGENTS_URL}/manage`}
          target="_blank"
          rel="noopener noreferrer"
          className="t2k-btn t2k-btn--blue t2k-btn--sm whitespace-nowrap"
        >
          Console&nbsp;→
        </a>
      </div>
    </nav>
  );
}
