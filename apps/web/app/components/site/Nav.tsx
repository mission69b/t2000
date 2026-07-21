"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AGENTS_URL,
  NAV_BUILD,
  NAV_PRODUCTS,
  type ProductSlug,
} from "../../data/t2k";

// Nav = the story in three verbs (Natural-pass rethink, 2026-07-21):
// Products ▾ (lifecycle order: wallet → payments → inference → verify) ·
// Agents (the flagship, undropped) · Build ▾ (the funnels, demoted).
// Dropdown pattern restored from the pre-flat nav (9cfddd9c~1).
type CurrentPage = ProductSlug | null;
type Menu = "products" | "build" | null;

const linkBase =
  "inline-flex items-center gap-1 text-[13px] font-medium tracking-tight whitespace-nowrap transition-colors cursor-pointer no-underline text-muted-foreground hover:text-foreground";

const PRODUCT_SLUGS = NAV_PRODUCTS.map((p) => p.slug as string);

export function Nav({ currentPage = null }: { currentPage?: CurrentPage }) {
  const [open, setOpen] = useState<Menu>(null);

  const inProducts = currentPage
    ? PRODUCT_SLUGS.includes(currentPage)
    : false;
  const inBuild = currentPage === "code";

  return (
    <nav
      onMouseLeave={() => setOpen(null)}
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
          <MenuButton
            label="Products"
            menu="products"
            open={open}
            setOpen={setOpen}
            active={inProducts}
          />

          <a
            href={AGENTS_URL}
            target="_blank"
            rel="noopener noreferrer"
            onMouseEnter={() => setOpen(null)}
            className={linkBase}
            style={currentPage === "agents" ? { color: "var(--fg)" } : undefined}
          >
            Agents
          </a>

          <MenuButton
            label="Build"
            menu="build"
            open={open}
            setOpen={setOpen}
            active={inBuild}
          />
        </div>

        <span className="flex-1" />

        <a
          href={`${AGENTS_URL}/manage`}
          target="_blank"
          rel="noopener noreferrer"
          onMouseEnter={() => setOpen(null)}
          className="t2k-btn t2k-btn--blue t2k-btn--sm whitespace-nowrap"
        >
          Console&nbsp;→
        </a>

        {open === "products" && (
          <Dropdown eyebrow="THE MONEY, IN ORDER" left={24}>
            {NAV_PRODUCTS.map((p) => (
              <MenuItem
                key={p.name}
                name={p.name}
                desc={p.desc}
                pkg={p.pkg}
                href={p.href}
                active={p.slug === currentPage}
              />
            ))}
          </Dropdown>
        )}
        {open === "build" && (
          <Dropdown eyebrow="BUILT ON THE RAIL" left={150}>
            {NAV_BUILD.map((b) => (
              <MenuItem
                key={b.name}
                name={b.name}
                desc={b.desc}
                href={b.href}
                external={"external" in b ? b.external : undefined}
                active={b.href === "/code" && currentPage === "code"}
              />
            ))}
          </Dropdown>
        )}
      </div>
    </nav>
  );
}

function MenuButton({
  label,
  menu,
  open,
  setOpen,
  active,
}: {
  label: string;
  menu: Exclude<Menu, null>;
  open: Menu;
  setOpen: (m: Menu) => void;
  active: boolean;
}) {
  const isOpen = open === menu;
  return (
    <button
      type="button"
      onMouseEnter={() => setOpen(menu)}
      onClick={() => setOpen(isOpen ? null : menu)}
      aria-expanded={isOpen}
      className={linkBase}
      style={{
        color: isOpen || active ? "var(--fg)" : "var(--fg-muted)",
        background: "transparent",
        border: 0,
        padding: 0,
      }}
    >
      {label}
      <Chevron open={isOpen} />
    </button>
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
  eyebrow,
  left,
  children,
}: {
  eyebrow: string;
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
      <div className="t2k-eyebrow px-3 pb-1 pt-2" style={{ fontSize: 10 }}>
        {eyebrow}
      </div>
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
