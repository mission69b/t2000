import Link from "next/link";
import { DEVELOPERS_URL, T2K } from "../../data/t2k";

// "The five layers" — the whitepaper's agent-economy map, status-chipped
// (ACP pivot 2026-07-18; supersedes the S.717 four-block stack).
export function StackBlocks() {
  return (
    <section className="t2k-section" id="stack">
      <div className="t2k-container">
        <header className="mb-12">
          <span className="t2k-eyebrow">{"// THE FIVE LAYERS"}</span>
          <h2 className="t2k-section-title mt-3">What every agent needs.</h2>
          <p className="t2k-section-sub">
            Identity, commerce, capital, labor, law. Machines and humans use
            the same five layers.
          </p>
        </header>

        <div className="t2k-blk-grid">
          {T2K.blocks.map((b, i) => (
            <BlockCard key={b.n} b={b} spanFull={i === T2K.blocks.length - 1} />
          ))}
        </div>

        <div className="t2k-blk-base">
          <Link href="/agent-wallet" className="t2k-blk-base-card">
            <span className="t2k-mono-tag">@t2000/sdk</span>
            <div>
              <div className="t2k-blk-base-name">Agent SDK</div>
              <div className="t2k-blk-base-sub">
                One TypeScript class under all of it — wallet, payments, swaps.
              </div>
            </div>
            <span className="t2k-blk-base-arrow">→</span>
          </Link>
          <a
            href={DEVELOPERS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="t2k-blk-base-card"
          >
            <span className="t2k-mono-tag t2k-mono-tag--blue">
              developers.t2000.ai
            </span>
            <div>
              <div className="t2k-blk-base-name">Docs</div>
              <div className="t2k-blk-base-sub">
                Quickstart, CLI reference, API reference — everything above.
              </div>
            </div>
            <span className="t2k-blk-base-arrow">→</span>
          </a>
        </div>
      </div>
    </section>
  );
}

type Block = (typeof T2K.blocks)[number];

const STATUS_COLOR: Record<string, string> = {
  live: "var(--ds-green-700)",
  next: "var(--t2k-accent)",
  horizon: "var(--ds-amber-700)",
  seeded: "var(--fg-subtle)",
};

function BlockCard({ b, spanFull }: { b: Block; spanFull?: boolean }) {
  return (
    <div
      className="t2k-blk-card"
      style={spanFull ? { gridColumn: "1 / -1" } : undefined}
    >
      <div className="t2k-blk-head flex items-center justify-between">
        <span className="t2k-blk-num">{b.n}</span>
        <span
          className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em]"
          style={{ color: STATUS_COLOR[b.status.tone] }}
        >
          {b.status.label}
        </span>
      </div>
      <h3 className="t2k-blk-title">{b.name}</h3>
      <p className="t2k-blk-desc">{b.desc}</p>
      <div className="t2k-blk-chips">
        {b.chips.map((c) => (
          <span key={c} className="t2k-blk-chip">
            {c}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {b.links.map((l) =>
          l.href.startsWith("/") ? (
            <Link key={l.href} href={l.href} className="t2k-blk-link">
              {l.label} →
            </Link>
          ) : (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="t2k-blk-link"
            >
              {l.label} →
            </a>
          ),
        )}
      </div>
    </div>
  );
}
