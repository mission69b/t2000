import Link from "next/link";
import { DEVELOPERS_URL } from "../../data/t2k";
import { CopyButton } from "../ui/CopyButton";

const CMD = `t2 pay https://mpp.t2000.ai/openai/v1/chat/completions \\
  --data '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}'`;

export function PaymentsCloser() {
  return (
    <section
      className="relative overflow-hidden"
      style={{ padding: "120px 24px 96px" }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{
          left: "50%",
          top: "55%",
          transform: "translate(-50%,-50%)",
          width: 820,
          height: 360,
          background:
            "radial-gradient(50% 50% at 50% 50%, rgba(0,114,245,0.10) 0%, transparent 70%)",
          filter: "blur(28px)",
        }}
      />

      <div className="relative mx-auto max-w-[820px] text-center">
        <h2
          className="t2k-display"
          style={{
            fontSize: "clamp(40px, 5.6vw, 68px)",
            letterSpacing: "-0.04em",
          }}
        >
          Pay your first API
          <br />
          <span style={{ color: "var(--t2k-accent)" }}>in 30 seconds</span>.
        </h2>

        <div
          className="mt-10 overflow-hidden rounded-[10px] border text-left"
          style={{
            background: "var(--ds-background-200)",
            borderColor: "var(--ds-gray-alpha-400)",
            boxShadow:
              "0 0 0 1px rgba(0,114,245,0.10), 0 24px 60px -20px rgba(0,114,245,0.20)",
          }}
        >
          <div
            className="flex items-center justify-between border-b px-3.5 py-2.5"
            style={{
              borderBottomColor: "var(--ds-gray-alpha-300)",
              background: "var(--ds-gray-100)",
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="block h-2.5 w-2.5 rounded-full"
                style={{ background: "#FF5F57" }}
              />
              <span
                className="block h-2.5 w-2.5 rounded-full"
                style={{ background: "#FEBC2E" }}
              />
              <span
                className="block h-2.5 w-2.5 rounded-full"
                style={{ background: "#28C840" }}
              />
              <span
                className="ml-2.5 font-mono text-[12px]"
                style={{
                  color: "var(--fg-subtle)",
                  letterSpacing: "0.01em",
                }}
              >
                ~ /agent
              </span>
            </div>
            <CopyButton payload={CMD} variant="filled" ariaLabel="Copy pay command" />
          </div>
          <pre
            className="m-0 whitespace-pre-wrap break-words font-mono text-[13.5px] leading-[1.75]"
            style={{
              padding: "22px 20px",
              color: "var(--fg)",
            }}
          >
            <span style={{ color: "var(--fg-subtle)" }}>$ </span>
            <span style={{ color: "var(--t2k-accent)" }}>t2 pay</span>{" "}
            https://mpp.t2000.ai/openai/v1/chat/completions{" "}
            <span style={{ color: "var(--fg-subtle)" }}>\</span>
            {"\n  "}
            <span style={{ color: "var(--fg-subtle)" }}>--data</span>{" "}
            <span style={{ color: "var(--ds-amber-700)" }}>
              &apos;{"{"}&quot;model&quot;:&quot;gpt-4o&quot;,&quot;messages&quot;:[{"{"}&quot;role&quot;:&quot;user&quot;,&quot;content&quot;:&quot;Hello&quot;{"}"}]{"}"}&apos;
            </span>
          </pre>
        </div>

        <div
          className="mt-7 text-[14px]"
          style={{ color: "var(--fg-muted)" }}
        >
          No wallet?{" "}
          <Link
            href="/agent-wallet"
            className="no-underline"
            style={{
              color: "var(--fg)",
              borderBottom: "1px solid var(--ds-gray-alpha-500)",
            }}
          >
            Install the Agent Wallet
          </Link>{" "}
          <span className="opacity-40">·</span>{" "}
          <a
            href={`${DEVELOPERS_URL}/agent-payments`}
            target="_blank"
            rel="noopener noreferrer"
            className="no-underline"
            style={{
              color: "var(--fg)",
              borderBottom: "1px solid var(--ds-gray-alpha-500)",
            }}
          >
            Read the docs ↗
          </a>
        </div>
      </div>
    </section>
  );
}
