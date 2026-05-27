import Link from "next/link";
import { totalServices, totalCategories } from "@/lib/catalog";

interface Step {
  n: string;
  tag: string;
  title: string;
  desc: string;
  cta: { label: string; href: string; external?: boolean };
}

export function MppCloser() {
  const steps: Step[] = [
    {
      n: "01",
      tag: "INSTALL",
      title: "Install the wallet.",
      desc: "One npm install. Or paste a prompt into Claude Desktop and let the agent set itself up.",
      cta: { label: "Install →", href: "https://t2000.ai/agent-wallet", external: true },
    },
    {
      n: "02",
      tag: "BROWSE",
      title: "Browse the catalog.",
      desc: `${totalServices()} services across ${totalCategories()} categories. Search, filter, and expand any service to see its endpoints.`,
      cta: { label: "Browse services →", href: "/services" },
    },
    {
      n: "03",
      tag: "PAY",
      title: "Pay your first call.",
      desc: "Each endpoint comes with three one-click commands — t2 CLI, a Claude prompt, or raw curl.",
      cta: { label: "Read the docs ↗", href: "https://developers.t2000.ai", external: true },
    },
  ];
  return (
    <section
      className="relative overflow-hidden"
      style={{
        padding: "112px 24px",
        borderTop: "1px solid var(--ds-gray-alpha-300)",
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          left: "50%",
          top: "50%",
          transform: "translate(-50%,-50%)",
          width: 820,
          height: 360,
          background:
            "radial-gradient(50% 50% at 50% 50%, rgba(18,165,148,0.10) 0%, transparent 70%)",
          filter: "blur(24px)",
        }}
      />

      <div className="relative mx-auto" style={{ maxWidth: "var(--t2k-page-max)" }}>
        <header className="mb-14 text-center">
          <span className="t2k-eyebrow mb-4 inline-block">// GET STARTED</span>
          <h2
            className="t2k-display"
            style={{
              fontSize: "clamp(40px, 5.6vw, 68px)",
              color: "var(--fg)",
            }}
          >
            Pay your first API
            <br />
            <span style={{ color: "var(--t2k-accent)" }}>in three steps.</span>
          </h2>
        </header>

        <div className="grid gap-3.5 md:grid-cols-3">
          {steps.map((s, i) => (
            <StepCard key={s.n} step={s} last={i === steps.length - 1} />
          ))}
        </div>
      </div>
    </section>
  );
}

function StepCard({ step, last }: { step: Step; last: boolean }) {
  const linkProps = step.cta.external
    ? { target: "_blank" as const, rel: "noopener noreferrer" }
    : {};
  const LinkOrAnchor = step.cta.external ? "a" : Link;

  return (
    <div
      className="t2k-card relative flex flex-col gap-3.5"
      style={{
        padding: "28px 26px 22px",
        background: "var(--bg-elevated)",
        borderColor: last ? "rgba(18,165,148,0.30)" : "var(--ds-gray-alpha-400)",
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className="font-mono"
          style={{
            fontSize: 11,
            color: last ? "var(--t2k-accent)" : "var(--fg-subtle)",
            letterSpacing: "0.06em",
          }}
        >
          {step.n}
        </span>
        <span
          style={{
            width: 1,
            height: 12,
            background: "var(--ds-gray-alpha-400)",
            display: "inline-block",
          }}
        />
        <span
          className="font-mono uppercase"
          style={{
            fontSize: 10.5,
            color: last ? "var(--t2k-accent)" : "var(--fg-muted)",
            letterSpacing: "0.10em",
          }}
        >
          {step.tag}
        </span>
      </div>

      <h3
        className="m-0 font-semibold"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 22,
          lineHeight: 1.15,
          letterSpacing: "-0.022em",
          color: "var(--fg)",
        }}
      >
        {step.title}
      </h3>

      <p
        className="m-0"
        style={{
          fontSize: 14,
          lineHeight: 1.55,
          color: "var(--fg-muted)",
        }}
      >
        {step.desc}
      </p>

      <div className="flex-1" />

      <LinkOrAnchor
        href={step.cta.href}
        {...linkProps}
        className="inline-flex items-center gap-1 no-underline transition-colors"
        style={{
          marginTop: 8,
          fontFamily: "var(--font-sans)",
          fontSize: 13.5,
          fontWeight: 500,
          letterSpacing: "-0.011em",
          color: last ? "var(--t2k-accent)" : "var(--fg)",
        }}
      >
        {step.cta.label}
      </LinkOrAnchor>
    </div>
  );
}
