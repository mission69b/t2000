import Link from "next/link";
import { AGENTS_URL, DEVELOPERS_URL } from "../../data/t2k";
import { CREATE_CMD } from "../../data/templates";
import { CopyButton } from "../ui/CopyButton";
import { HeroTerminal } from "./HeroTerminal";

const WORKS_WITH = [
  { l: "Claude Desktop" },
  { l: "Codex" },
  { l: "Cursor" },
  { l: "Claws" },
  { l: "+ Custom agents", muted: true },
];

export function Hero() {
  return (
    <section
      className="relative overflow-hidden border-b"
      style={{
        padding: "96px 0 64px",
        borderBottomColor: "var(--ds-gray-alpha-300)",
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          right: "-10%",
          top: "10%",
          width: 720,
          height: 540,
          background:
            "radial-gradient(45% 50% at 50% 50%, rgba(0,114,245,0.10) 0%, transparent 70%)",
          filter: "blur(24px)",
        }}
      />

      <div className="t2k-container relative">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-14">
          <div>
            <div className="t2k-eyebrow mb-[22px]">
              {"// THE AGENT STACK · ON SUI"}
            </div>
            <h1
              className="t2k-display"
              style={{
                fontSize: "clamp(44px, 6.4vw, 84px)",
                color: "var(--fg)",
              }}
            >
              The agent stack
              <br />
              <span style={{ color: "var(--t2k-accent)" }}>on Sui.</span>
            </h1>
            <p
              className="m-0 max-w-[520px]"
              style={{
                marginTop: 26,
                fontSize: 19,
                lineHeight: 1.5,
                color: "var(--fg-muted)",
                letterSpacing: "-0.014em",
              }}
            >
              Build agents that move{" "}
              <span style={{ color: "var(--t2k-accent)" }}>money</span>. One
              sign-in is a wallet, an identity, and an API key — non-custodial,
              gasless, verifiable.
            </p>

            <div className="mt-8 flex flex-wrap gap-2.5">
              <a
                href={`${AGENTS_URL}/manage`}
                target="_blank"
                rel="noopener noreferrer"
                className="t2k-btn t2k-btn--blue t2k-btn--lg"
              >
                Start free&nbsp;↗
              </a>
              <a
                href={DEVELOPERS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="t2k-btn t2k-btn--ghost t2k-btn--lg"
              >
                Read the docs
              </a>
            </div>

            <div
              className="mt-6 inline-flex max-w-full items-center gap-3 rounded-lg border py-2 pr-2 pl-3.5"
              style={{
                background: "var(--ds-gray-alpha-100)",
                borderColor: "var(--ds-gray-alpha-300)",
              }}
            >
              <code
                className="min-w-0 truncate font-mono text-[13px]"
                style={{ color: "var(--fg)" }}
              >
                <span style={{ color: "var(--fg-subtle)" }}>$ </span>
                {CREATE_CMD}
              </code>
              <CopyButton payload={CREATE_CMD} />
            </div>
            <div className="mt-2.5">
              <Link
                href="/templates"
                className="text-[12.5px] font-medium no-underline transition-colors hover:text-foreground"
                style={{ color: "var(--fg-subtle)", letterSpacing: "-0.011em" }}
              >
                Browse templates →
              </Link>
            </div>
          </div>

          <HeroTerminal />
        </div>

        <div className="mt-[72px]">
          <WorksWith />
        </div>
      </div>
    </section>
  );
}

function WorksWith() {
  return (
    <div
      className="mx-auto flex flex-wrap items-center justify-center gap-x-[22px] gap-y-3 rounded-full border"
      style={{
        padding: "12px 24px",
        borderColor: "var(--ds-gray-alpha-300)",
        background: "var(--ds-gray-alpha-100)",
        maxWidth: 820,
      }}
    >
      <span className="t2k-eyebrow" style={{ fontSize: 10.5 }}>
        WORKS WITH
      </span>
      {WORKS_WITH.map((c, i) => (
        <span key={c.l} className="inline-flex items-center gap-x-[22px]">
          {i > 0 && (
            <span
              className="rounded-full"
              style={{
                width: 3,
                height: 3,
                background: "var(--ds-gray-alpha-500)",
              }}
            />
          )}
          <span
            className="text-[14px] font-medium"
            style={{
              letterSpacing: "-0.011em",
              color: c.muted ? "var(--fg-subtle)" : "var(--fg)",
            }}
          >
            {c.l}
          </span>
        </span>
      ))}
    </div>
  );
}
