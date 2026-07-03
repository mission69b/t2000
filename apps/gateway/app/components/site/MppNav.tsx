import Link from "next/link";

type CurrentPage = "services" | "activity" | null;

const LINKS: Array<{ id: NonNullable<CurrentPage>; label: string; href: string }> = [
  { id: "services", label: "Services", href: "/services" },
  { id: "activity", label: "Activity", href: "/activity" },
];

export function MppNav({ currentPage = null }: { currentPage?: CurrentPage }) {
  return (
    <nav
      className="sticky top-0 z-30 border-b backdrop-blur-md backdrop-saturate-150"
      style={{
        background: "rgba(10,10,10,0.72)",
        borderBottomColor: "var(--ds-gray-alpha-300)",
      }}
    >
      <div
        className="mx-auto flex h-[60px] items-center gap-6 px-6"
        style={{ maxWidth: "var(--t2k-page-max)" }}
      >
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-foreground no-underline"
          aria-label="t2000 mpp — home"
        >
          <img
            alt=""
            aria-hidden="true"
            height={22}
            src="/brand/pfp-t2-white-field.svg"
            style={{ display: "block", borderRadius: 5 }}
            width={22}
          />

          <span
            className="pl-2 font-mono text-[14px] font-medium tracking-[0.02em]"
            style={{ borderLeft: "1px solid var(--ds-gray-alpha-300)" }}
          >
            mpp
          </span>
        </Link>

        <div className="ml-2 flex items-center gap-[18px]">
          {LINKS.map((l) => {
            const active = l.id === currentPage;
            return (
              <Link
                key={l.id}
                href={l.href}
                className={
                  "text-[13px] font-medium tracking-[-0.011em] no-underline transition-colors " +
                  (active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {l.label}
              </Link>
            );
          })}
        </div>

        <span className="flex-1" />

        <span
          className="hidden md:inline-flex items-center gap-[7px] rounded-full border px-[11px] py-[5px] font-mono text-[12px] tracking-[0.01em] text-muted-foreground"
          style={{
            background: "var(--ds-gray-alpha-100)",
            borderColor: "var(--ds-gray-alpha-300)",
          }}
        >
          <span className="t2k-dot" />
          <span>gateway live</span>
        </span>

        <a
          href="https://github.com/mission69b/t2000"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden text-[13px] font-medium tracking-[-0.011em] text-muted-foreground no-underline transition-colors hover:text-foreground md:inline-flex"
        >
          GitHub
        </a>

        <a
          href="https://suimpp.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden font-mono text-[12px] tracking-[0.01em] text-dim no-underline transition-colors hover:text-foreground md:inline-flex"
          style={{
            paddingLeft: 12,
            borderLeft: "1px solid var(--ds-gray-alpha-300)",
          }}
        >
          suimpp.dev&nbsp;↗
        </a>

        <a
          href="https://t2000.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[12px] tracking-[0.01em] text-dim no-underline transition-colors hover:text-foreground"
        >
          t2000.ai&nbsp;↗
        </a>
      </div>
    </nav>
  );
}
