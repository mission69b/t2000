import Link from "next/link";

export function Breadcrumb({ label = "t2000.ai" }: { label?: string }) {
  return (
    <Link
      href="/"
      className="mb-7 inline-flex items-center gap-1.5 font-mono text-[13px] tracking-[0.01em] no-underline transition-colors hover:text-foreground"
      style={{ color: "var(--fg-muted)" }}
    >
      <span className="opacity-60">←</span> {label}
    </Link>
  );
}
