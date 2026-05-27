import Link from "next/link";

export default function NotFound() {
  return (
    <section className="relative min-h-[calc(100vh-60px)] flex items-center justify-center overflow-hidden px-6 py-20">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 blur-3xl"
        style={{
          width: 760,
          height: 360,
          background:
            "radial-gradient(50% 50% at 50% 50%, rgba(0,114,245,0.10) 0%, transparent 70%)",
        }}
      />

      <div className="relative max-w-[640px] text-center">
        <div
          className="text-foreground mb-3 font-semibold"
          style={{
            fontSize: "clamp(96px, 18vw, 200px)",
            lineHeight: 0.9,
            letterSpacing: "-0.05em",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          4<span className="text-accent">0</span>4
        </div>

        <div className="inline-flex items-center gap-2 mb-6">
          <span className="font-mono text-[14px] font-medium text-muted tracking-tight">
            t2000
          </span>
        </div>

        <h1 className="text-foreground font-semibold m-0 text-[28px] sm:text-[40px] leading-[1.15] tracking-tight">
          Page not found.
        </h1>

        <p className="mt-3.5 text-base leading-[1.55] text-muted max-w-[460px] mx-auto">
          The thing you wanted isn&rsquo;t here. Probably never was.
        </p>

        <div className="flex gap-2.5 justify-center mt-8 flex-wrap">
          <Link
            href="/"
            className="px-6 py-3 min-h-[44px] flex items-center bg-accent text-white font-mono text-[10px] tracking-[0.12em] uppercase transition-colors hover:bg-[var(--t2k-accent-hover)]"
          >
            Back home
          </Link>
          <a
            href="https://developers.t2000.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 min-h-[44px] flex items-center text-muted font-mono text-[10px] tracking-[0.12em] uppercase border border-border-bright transition-colors hover:text-foreground hover:border-foreground"
          >
            Read the docs <span aria-hidden="true" className="ml-1.5">↗</span>
          </a>
        </div>
      </div>
    </section>
  );
}
