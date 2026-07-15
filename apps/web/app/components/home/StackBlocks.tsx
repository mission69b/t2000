import Link from "next/link";
import { DEVELOPERS_URL, T2K } from "../../data/t2k";

// "Explore the stack" — numbered building-block cards (S.717 home rethink).
// Each block: number, title, one line, capability chips, one docs link.
export function StackBlocks() {
  return (
    <section className="t2k-section" id="stack">
      <div className="t2k-container">
        <header className="mb-12">
          <span className="t2k-eyebrow">{"// BUILDING BLOCKS"}</span>
          <h2 className="t2k-section-title mt-3">Explore the stack.</h2>
          <p className="t2k-section-sub">
            Four blocks that compose into every agent. Pick one to dig in.
          </p>
        </header>

        <div className="t2k-blk-grid">
          {T2K.blocks.map((b) => (
            <BlockCard key={b.n} b={b} />
          ))}
        </div>

        <div className="t2k-blk-base">
          <Link href="/agent-sdk" className="t2k-blk-base-card">
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

function BlockCard({ b }: { b: Block }) {
  const inner = (
    <>
      <div className="t2k-blk-head">
        <span className="t2k-blk-num">{b.n}</span>
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
      <span className="t2k-blk-link">{b.linkLabel} →</span>
    </>
  );
  return b.href.startsWith("/") ? (
    <Link href={b.href} className="t2k-blk-card">
      {inner}
    </Link>
  ) : (
    <a
      href={b.href}
      target="_blank"
      rel="noopener noreferrer"
      className="t2k-blk-card"
    >
      {inner}
    </a>
  );
}
