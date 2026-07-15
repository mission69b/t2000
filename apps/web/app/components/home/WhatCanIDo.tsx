import { AGENTS_URL } from "../../data/t2k";

// The first answer after the hero: "WHAT CAN I DO?" — three verbs, one
// sign-in (SPEC_INFERENCE_DEMAND item 14). Everything links into the console;
// the CLI line covers the machine path. The stack ladder below stays for the
// architecture-curious.

const VERBS = [
  {
    tag: "USE",
    title: "Every model, privately",
    desc: "One key, one base URL — every model, zero data retention. Free daily coding allowance.",
    cmd: 'model = "t2000/auto"',
    link: { label: "Get a key", href: `${AGENTS_URL}/manage` },
  },
  {
    tag: "SPEND",
    title: "Give your agent money",
    desc: "Your account is a USDC wallet. Your agent pays any x402 API per call — gasless, no signups.",
    cmd: "t2 pay mpp.t2000.ai/exa/v1/search",
    link: { label: "See what it can buy", href: "https://mpp.t2000.ai" },
  },
  {
    tag: "EARN",
    title: "Get paid for your API",
    desc: "Paste your x402 endpoint — probed live, listed with one signature. Buyers pay USDC per call, straight to your wallet.",
    cmd: "Console → Sell your API → Verify & list",
    link: { label: "List your API", href: `${AGENTS_URL}/manage` },
  },
] as const;

export function WhatCanIDo() {
  return (
    <section className="t2k-section" id="what-can-i-do">
      <div className="t2k-container">
        <header className="mb-11 flex flex-wrap items-end justify-between gap-6">
          <div>
            <span className="t2k-eyebrow">{"// WHAT CAN I DO"}</span>
            <h2 className="t2k-section-title mt-3">
              Use models. Pay APIs. Get paid.
            </h2>
          </div>
          <p
            className="m-0 max-w-[340px] text-[16px] leading-[1.55]"
            style={{ color: "var(--fg-muted)", letterSpacing: "-0.011em" }}
          >
            One sign-in — wallet, Agent ID, API key. Console or t2 CLI.
          </p>
        </header>

        <div className="t2k-wcid-grid">
          {VERBS.map((v) => (
            <a
              key={v.tag}
              href={v.link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="t2k-wcid-card"
            >
              <span className="t2k-mono-tag">{v.tag}</span>
              <h3 className="t2k-wcid-title">{v.title}</h3>
              <p className="t2k-wcid-desc">{v.desc}</p>
              <code className="t2k-gs-cmd">
                <span className="t2k-gs-dollar">$</span>
                {v.cmd}
              </code>
              <span className="t2k-wcid-link">{v.link.label} →</span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
