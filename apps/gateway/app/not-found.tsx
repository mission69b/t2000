import Link from "next/link";
import { MppNav } from "./components/site/MppNav";

export default function NotFound() {
  return (
    <>
      <MppNav />
      <main>
        <section className="relative flex min-h-[calc(100vh-60px)] items-center justify-center overflow-hidden px-6 py-20">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 blur-3xl"
          style={{
            width: 760,
            height: 360,
            background:
              "radial-gradient(50% 50% at 50% 50%, rgba(18,165,148,0.10) 0%, transparent 70%)",
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
            4
            <span style={{ color: "var(--t2k-accent)" }}>0</span>
            4
          </div>

          <div className="mb-6 inline-flex items-center gap-2">
            <span className="font-mono text-[14px] font-medium tracking-tight text-muted-foreground">
              t2000 · mpp
            </span>
          </div>

          <h1 className="text-foreground m-0 text-[28px] font-semibold leading-[1.15] tracking-tight sm:text-[40px]">
            Endpoint not found.
          </h1>

          <p className="mx-auto mt-3.5 max-w-[460px] text-base leading-[1.55] text-muted-foreground">
            No such resource at this URL. The gateway only routes to known services.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-2.5">
            <Link
              href="/services"
              className="t2k-btn t2k-btn--blue"
              style={{ minHeight: 44 }}
            >
              Browse services
            </Link>
            <a
              href="https://mpp.t2000.ai/openapi.json"
              target="_blank"
              rel="noopener noreferrer"
              className="t2k-btn t2k-btn--ghost"
              style={{ minHeight: 44 }}
            >
              Open OpenAPI ↗
            </a>
          </div>
        </div>
        </section>
      </main>
    </>
  );
}
