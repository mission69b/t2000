"use client";

import { useState } from "react";
import {
  DEVELOPERS_URL,
  GITHUB_URL,
  NAV_FAMILY,
  NAV_PRODUCTS,
  STORE_URL,
} from "../data/site";

// Family nav (designer's Nav.jsx for verify.t2000.ai) — same structure as
// t2000.ai's nav, product links absolute, "Verify" is the current property.

const linkBase =
  "inline-flex items-center gap-1 text-[13px] font-medium tracking-tight whitespace-nowrap transition-colors cursor-pointer no-underline text-muted hover:text-foreground";

export function SiteNav() {
  const [open, setOpen] = useState(false);

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
        <a
          href="/"
          className="inline-flex items-center gap-2 no-underline"
          style={{ color: "var(--fg)" }}
          aria-label="verify.t2000.ai — home"
        >
          <span
            aria-hidden="true"
            className="inline-block text-[20px] font-bold leading-none"
            style={{ letterSpacing: "-0.05em" }}
          >
            t2
          </span>
          <span
            className="pl-2 font-mono text-[14px] font-medium tracking-[0.02em]"
            style={{ borderLeft: "1px solid var(--ds-gray-alpha-300)" }}
          >
            verify
          </span>
        </a>

        <div className="ml-2 flex items-center gap-[18px]">
          <button
            type="button"
            onMouseEnter={() => setOpen(true)}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={linkBase}
            style={{
              color: open ? "var(--fg)" : "var(--fg-muted)",
              background: "transparent",
              border: 0,
              padding: 0,
            }}
          >
            Products
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
          className="hidden md:inline-flex items-center gap-[7px] rounded-full border px-[11px] py-[5px] font-mono text-[12px] tracking-[0.01em]"
          style={{
            background: "var(--ds-gray-alpha-100)",
            borderColor: "var(--ds-gray-alpha-300)",
            color: "var(--fg-muted)",
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
          href={STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="t2k-btn t2k-btn--blue t2k-btn--sm whitespace-nowrap"
        >
          List your agent&nbsp;→
        </a>

        {open && <ProductsMenu />}
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

function ProductsMenu() {
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
          <MenuItem key={p.name} name={p.name} desc={p.desc} pkg={p.pkg} href={p.href} />
        ))}
      </div>
      <div className="my-2 h-px" style={{ background: "var(--ds-gray-alpha-300)" }} />
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
            active={c.name === "Verify"}
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
}: {
  name: string;
  desc: string;
  pkg?: string;
  href: string;
  external?: boolean;
  active?: boolean;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : null)}
      className="block rounded-md px-3 py-2.5 no-underline transition-colors hover:bg-[var(--ds-gray-alpha-100)]"
      style={{
        color: "var(--fg)",
        ...(active ? { background: "var(--t2k-accent-bg)" } : null),
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="inline-flex items-center gap-2 text-[14px] font-medium tracking-tight"
          style={{ color: active ? "var(--t2k-accent)" : "var(--fg)" }}
        >
          {name}
          {external && <span style={{ color: "var(--fg-subtle)" }}>↗</span>}
          {active && (
            <span className="font-mono text-[10px]" style={{ color: "var(--t2k-accent)" }}>
              • ON
            </span>
          )}
        </span>
        {pkg && (
          <span className="font-mono text-[10.5px]" style={{ color: "var(--fg-subtle)" }}>
            {pkg}
          </span>
        )}
      </div>
      <div className="mt-0.5 text-[12.5px] leading-tight" style={{ color: "var(--fg-muted)" }}>
        {desc}
      </div>
    </a>
  );
}
