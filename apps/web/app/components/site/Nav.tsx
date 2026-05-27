"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AUDRIC_URL,
  DEVELOPERS_URL,
  GITHUB_URL,
  NAV_FAMILY,
  NAV_PRODUCTS,
} from "../../data/t2k";

type CurrentPage = "wallet" | "payments" | "sdk" | "engine" | null;

const linkBase =
  "inline-flex items-center gap-1 text-[13px] font-medium tracking-tight whitespace-nowrap transition-colors cursor-pointer no-underline text-muted hover:text-foreground";

export function Nav({ currentPage = null }: { currentPage?: CurrentPage }) {
  const [open, setOpen] = useState(false);

  const productHeading = currentPage
    ? NAV_PRODUCTS.find((p) => p.slug === currentPage)?.name
    : null;

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
        >
          <span className="text-[16px] font-semibold tracking-[-0.022em]">
            t2000
          </span>
        </Link>

        <div className="ml-2 flex items-center gap-[18px]">
          <button
            type="button"
            onMouseEnter={() => setOpen(true)}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={linkBase}
            style={{
              color: open || currentPage ? "var(--fg)" : "var(--fg-muted)",
              background: "transparent",
              border: 0,
              padding: 0,
            }}
          >
            Products
            {productHeading && (
              <span
                className="ml-1.5 rounded-full px-1.5 py-px font-mono text-[10px] font-medium uppercase tracking-[0.04em]"
                style={{
                  background: "var(--t2k-accent-bg)",
                  color: "var(--t2k-accent)",
                }}
              >
                {productHeading}
              </span>
            )}
            <Chevron open={open} />
          </button>

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

        <span
          className="hidden md:inline-flex items-center gap-[7px] rounded-full border px-[11px] py-[5px] font-mono text-[12px] tracking-[0.01em] text-muted"
          style={{
            background: "var(--ds-gray-alpha-100)",
            borderColor: "var(--ds-gray-alpha-300)",
          }}
          onMouseEnter={() => setOpen(false)}
        >
          <span className="t2k-dot" />
          <span>mainnet</span>
        </span>

        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          onMouseEnter={() => setOpen(false)}
          className={linkBase + " hidden md:inline-flex"}
        >
          GitHub
        </a>

        <a
          href={AUDRIC_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="t2k-btn t2k-btn--blue t2k-btn--sm whitespace-nowrap"
        >
          Try Audric&nbsp;→
        </a>

        {open && <ProductsMenu currentPage={currentPage} />}
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

function ProductsMenu({ currentPage }: { currentPage: CurrentPage }) {
  return (
    <div
      className="absolute z-40 rounded-[10px] border p-[10px]"
      style={{
        top: 56,
        left: 24,
        width: 580,
        background: "var(--ds-background-100)",
        borderColor: "var(--ds-gray-alpha-400)",
        boxShadow: "var(--shadow-lg)",
        animation: "fadeInUp 120ms cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      <div className="t2k-eyebrow px-3 pb-1 pt-2" style={{ fontSize: 10 }}>
        AGENT PRODUCTS
      </div>
      <div className="grid grid-cols-2 gap-0.5">
        {NAV_PRODUCTS.map((p) => (
          <MenuItem
            key={p.name}
            name={p.name}
            desc={p.desc}
            pkg={p.pkg}
            href={p.href}
            active={p.slug === currentPage}
            soon={"soon" in p ? p.soon : undefined}
          />
        ))}
      </div>
      <div
        className="my-2 h-px"
        style={{ background: "var(--ds-gray-alpha-300)" }}
      />
      <div className="t2k-eyebrow px-3 py-1" style={{ fontSize: 10 }}>
        FAMILY
      </div>
      <div className="grid grid-cols-2 gap-0.5">
        {NAV_FAMILY.map((c) => (
          <MenuItem
            key={c.name}
            name={c.name}
            desc={c.desc}
            href={c.href}
            external={c.external}
          />
        ))}
      </div>
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
  soon,
}: {
  name: string;
  desc: string;
  pkg?: string;
  href: string;
  external?: boolean;
  active?: boolean;
  soon?: boolean;
}) {
  const isInternal = href.startsWith("/");
  const interactiveClassName =
    "block rounded-md px-3 py-2.5 no-underline text-foreground transition-colors hover:bg-[var(--ds-gray-alpha-100)]";
  const soonClassName = "block rounded-md px-3 py-2.5 text-foreground";
  const style = {
    background: active ? "var(--t2k-accent-bg)" : "transparent",
    ...(soon ? { opacity: 0.78, cursor: "default" as const } : null),
  };

  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span
          className="inline-flex items-center gap-2 text-[14px] font-medium tracking-tight"
          style={{ color: active ? "var(--t2k-accent)" : "var(--fg)" }}
        >
          {name}
          {external && (
            <span style={{ color: "var(--fg-subtle)" }}>↗</span>
          )}
          {active && (
            <span
              className="font-mono text-[10px]"
              style={{ color: "var(--t2k-accent)" }}
            >
              • ON
            </span>
          )}
          {soon && (
            <span
              className="font-mono uppercase"
              style={{
                fontSize: 9.5,
                letterSpacing: "0.06em",
                color: "var(--fg-subtle)",
                padding: "2px 6px",
                border: "1px solid var(--ds-gray-alpha-400)",
                borderRadius: 3,
              }}
            >
              Soon
            </span>
          )}
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

  if (soon) {
    return (
      <div
        className={soonClassName}
        style={style}
        aria-disabled="true"
      >
        {inner}
      </div>
    );
  }

  if (isInternal) {
    return (
      <Link href={href} className={interactiveClassName} style={style}>
        {inner}
      </Link>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={interactiveClassName}
      style={style}
    >
      {inner}
    </a>
  );
}
