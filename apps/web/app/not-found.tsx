import Link from "next/link";

import { Nav } from "./components/site/Nav";
import { SiteFooter } from "./components/site/SiteFooter";

export default function NotFound() {
  return (
    <>
      <Nav />
      <main>
        <section className="relative flex min-h-[calc(100vh-60px)] items-center justify-center overflow-hidden px-6 py-20">
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
              className="mb-3 font-semibold text-foreground"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(96px, 18vw, 200px)",
                lineHeight: 0.9,
                letterSpacing: "-0.05em",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              4<span style={{ color: "var(--t2k-accent)" }}>0</span>4
            </div>

            <div className="mb-6 inline-flex items-center gap-2">
              <span className="font-mono text-[14px] font-medium tracking-tight text-muted-foreground">
                t2000
              </span>
            </div>

            <h1
              className="m-0 font-semibold text-foreground"
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "clamp(28px, 4vw, 40px)",
                lineHeight: 1.15,
                letterSpacing: "-0.025em",
              }}
            >
              Page not found.
            </h1>

            <p className="mx-auto mt-3.5 max-w-[460px] text-base leading-[1.55] tracking-[-0.011em] text-muted-foreground">
              The thing you wanted isn&rsquo;t here. Probably never was.
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-2.5">
              <Link href="/" className="t2k-btn t2k-btn--blue t2k-btn--lg">
                Back home
              </Link>
              <a
                href="https://developers.t2000.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="t2k-btn t2k-btn--ghost t2k-btn--lg"
              >
                Read the docs ↗
              </a>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
