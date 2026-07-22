"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AGENTS_URL,
  DEVELOPERS_URL,
  NAV_PRODUCTS,
  type ProductSlug,
} from "../../data/t2k";

// Nav = one dropdown + two links (2026-07-22 simplification): Products ▾
// (everything we make, lifecycle order) · Agents (the flagship, undropped) ·
// Developers (docs). Console stays the right-side action.
type CurrentPage = ProductSlug | null;

const linkBase =
  "inline-flex items-center gap-1 text-[13px] font-medium tracking-tight whitespace-nowrap transition-colors cursor-pointer no-underline text-muted-foreground hover:text-foreground";

const PRODUCT_SLUGS = NAV_PRODUCTS.flatMap((p) => (p.slug ? [p.slug] : []));

export function Nav({ currentPage = null }: { currentPage?: CurrentPage }) {
  const [open, setOpen] = useState(false);

  const inProducts = currentPage
    ? PRODUCT_SLUGS.includes(currentPage)
    : false;

  return (
    <nav
      onMouseLeave={() => setOpen(false)}
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
          <button
            type="button"
            onMouseEnter={() => setOpen(true)}
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className={linkBase}
            style={{
              color: open || inProducts ? "var(--fg)" : "var(--fg-muted)",
              background: "transparent",
              border: 0,
              padding: 0,
            }}
          >
            Products
            <Chevron open={open} />
          </button>

          <a
            href={AGENTS_URL}
            target="_blank"
            rel="noopener noreferrer"
            onMouseEnter={() => setOpen(false)}
            className={linkBase}
            style={currentPage === "agents" ? { color: "var(--fg)" } : undefined}
          >
            Agents
          </a>

          <a
            href={DEVELOPERS_URL}
            target="_blank"
            rel="noopener noreferrer"
            onMouseEnter={() => setOpen(false)}
            className={linkBase}
          >
            Developers
          </a>
        </div>

        <span className="flex-1" />

        <a
          href={`${AGENTS_URL}/manage`}
          target="_blank"
          rel="noopener noreferrer"
          onMouseEnter={() => setOpen(false)}
          className="t2k-btn t2k-btn--blue t2k-btn--sm whitespace-nowrap"
        >
          Console&nbsp;→
        </a>

        {open && (
          <Dropdown left={24}>
            {NAV_PRODUCTS.map((p) => (
              <MenuItem
                key={p.name}
                name={p.name}
                desc={p.desc}
                pkg={p.pkg}
                href={p.href}
                external={p.external}
                active={p.slug !== undefined && p.slug === currentPage}
              />
            ))}
          </Dropdown>
        )}
      </div>
    </nav>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      aria-hidden="true"
      style={{
        transition: "transform 100ms cubic-bezier(0.16,1,0.3,1)",
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        opacity: 0.7,
      }}
    >
      <path
        d="M2 4l3 3 3-3"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Dropdown({
  left,
  children,
}: {
  left: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute z-40 rounded-[10px] border p-[10px]"
      style={{
        top: 56,
        left,
        width: 520,
        background: "var(--ds-background-100)",
        borderColor: "var(--ds-gray-alpha-400)",
        boxShadow: "var(--shadow-lg)",
        animation: "fadeInUp 120ms cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      <div className="grid grid-cols-2 gap-0.5">{children}</div>
    </div>
  );
}

function MenuItem({
  name,
  desc,
  pkg,
  href,
  external,
  active,
}: {
  name: string;
  desc: string;
  pkg?: string;
  href: string;
  external?: boolean;
  active?: boolean;
}) {
  const isInternal = href.startsWith("/");
  const className =
    "block rounded-md px-3 py-2.5 no-underline text-foreground transition-colors hover:bg-[var(--ds-gray-alpha-100)]";
  const style = active ? { background: "var(--t2k-accent-bg)" } : undefined;

  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span
          className="inline-flex items-center gap-2 text-[14px] font-medium tracking-tight"
          style={{ color: active ? "var(--t2k-accent)" : "var(--fg)" }}
        >
          {name}
          {external && <span style={{ color: "var(--fg-subtle)" }}>↗</span>}
        </span>
        {pkg && (
          <span
            className="font-mono text-[10.5px]"
            style={{ color: active ? "var(--t2k-accent)" : "var(--fg-subtle)" }}
          >
            {pkg}
          </span>
        )}
      </div>
      <div
        className="mt-0.5 text-[12.5px] leading-tight"
        style={{ color: "var(--fg-muted)" }}
      >
        {desc}
      </div>
    </>
  );

  if (isInternal) {
    return (
      <Link href={href} className={className} style={style}>
        {inner}
      </Link>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      style={style}
    >
      {inner}
    </a>
  );
}
