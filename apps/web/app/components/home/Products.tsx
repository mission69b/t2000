"use client";

import Link from "next/link";
import { useState } from "react";
import { T2K } from "../../data/t2k";

// "The climb" — four capabilities an agent gains, bottom to top. A numbered
// vertical ladder with a connecting spine, each rung linking to its product
// page(s). Classes live in styles/page.css (t2k-climb / t2k-rung-*).
export function Products() {
  return (
    <section className="t2k-section" id="stack">
      <div className="t2k-container">
        <header className="mb-12">
          <span className="t2k-eyebrow">{"// UNDER THE HOOD"}</span>
          <h2 className="t2k-section-title mt-3">Everything an agent needs.</h2>
        </header>

        <div className="t2k-climb">
          {T2K.climb.map((r, i) => (
            <ClimbRung key={r.n} r={r} last={i === T2K.climb.length - 1} />
          ))}
        </div>

        {/* Substrate + platform footer */}
        <div className="t2k-climb-base">
          <Link href="/agent-sdk" className="t2k-climb-base-card">
            <span className="t2k-mono-tag">@t2000/sdk</span>
            <div>
              <div className="t2k-climb-base-name">Agent SDK</div>
              <div className="t2k-climb-base-sub">
                One TypeScript class — wallet, payments, swaps. Powers Audric.
              </div>
            </div>
            <span className="t2k-climb-base-arrow">→</span>
          </Link>
          <a
            href="https://agents.t2000.ai/"
            target="_blank"
            rel="noopener noreferrer"
            className="t2k-climb-base-card"
          >
            <span className="t2k-mono-tag t2k-mono-tag--blue">agents.t2000.ai</span>
            <div>
              <div className="t2k-climb-base-name">t2 Agents</div>
              <div className="t2k-climb-base-sub">
                The agent directory + console. Look up any agent; manage yours.
              </div>
            </div>
            <span className="t2k-climb-base-arrow">→</span>
          </a>
        </div>
      </div>
    </section>
  );
}

type Rung = (typeof T2K.climb)[number];

function ClimbRung({ r, last }: { r: Rung; last: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <div className="t2k-rung">
      <div className="t2k-rung-spine">
        <span
          className="t2k-rung-node"
          style={hover ? { borderColor: "var(--t2k-accent)", color: "var(--t2k-accent)" } : undefined}
        >
          {r.n}
        </span>
        {!last && <span className="t2k-rung-line" />}
      </div>

      <div
        className="t2k-rung-body"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={hover ? { borderColor: "var(--ds-gray-alpha-500)" } : undefined}
      >
        <div className="t2k-rung-head">
          <div>
            <span className="t2k-rung-layer">{r.layer}</span>
            <h3 className="t2k-rung-name">{r.name}</h3>
          </div>
          <div className="t2k-rung-one">{r.one}</div>
        </div>

        <p className="t2k-rung-desc">{r.desc}</p>

        <div className="t2k-rung-foot">
          <div className="t2k-rung-verbs">
            {r.verbs.map((v) => (
              <div key={v}>
                <span className="t2k-rung-dollar">$</span>
                {v}
              </div>
            ))}
          </div>
          <div className="t2k-rung-links">
            {r.links.map((l) =>
              l.href.startsWith("/") ? (
                <Link key={l.href} href={l.href} className="t2k-rung-link">
                  {l.label} →
                </Link>
              ) : (
                <a
                  key={l.href}
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="t2k-rung-link"
                >
                  {l.label} →
                </a>
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
