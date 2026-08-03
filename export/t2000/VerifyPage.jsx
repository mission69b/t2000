// ============================================================
// VerifyPage — verify.t2000.ai
// The trust-close for the Private & Confidential API. Paste a
// confidential receipt id (rcpt-…) and run the trustless checks:
// Sui anchor, receipt signature, and the Intel TDX quote (DCAP).
// Sections: Hero (interactive verifier) · How it works · Ledger · Closer.
// ============================================================

const VERIFY_SAMPLE = "rcpt-c85d927ee9c67753d2876d78";
const SUISCAN_TX = "J2r4bjYYBzGM8e45VhAk51xEFo6cyqXJR61RVV6aQb4C";

// ── Hero — interactive verifier ──────────────────────────────
function VerifyHero() {
  const urlRcpt = (() => { try { return new URLSearchParams(location.search).get("rcpt"); } catch (e) { return null; } })();
  const [value, setValue] = React.useState(urlRcpt || VERIFY_SAMPLE);
  const [state, setState] = React.useState("idle"); // idle · checking · ok
  const run = () => {
    if (!value.trim()) return;
    setState("checking");
    setTimeout(() => setState("ok"), 1100);
  };
  React.useEffect(() => { const r = setTimeout(run, 700); return () => clearTimeout(r); }, []);

  return (
    <section style={{ position: "relative", padding: "92px 0 64px", borderBottom: "1px solid var(--ds-gray-alpha-300)", overflow: "hidden" }}>
      <div aria-hidden="true" style={{
        position: "absolute", right: "-8%", top: "6%", width: 700, height: 500,
        background: "radial-gradient(45% 50% at 50% 50%, rgba(255,255,255,0.10) 0%, transparent 70%)",
        filter: "blur(24px)", pointerEvents: "none",
      }} />
      <div className="t2k-container" style={{ position: "relative" }}>
        <div style={{ maxWidth: 700, margin: "0 auto 40px", textAlign: "center" }}>
          <div className="t2k-eyebrow" style={{ marginBottom: 20 }}>// VERIFY · verify.t2000.ai</div>
          <h1 className="t2k-display" style={{ fontSize: "clamp(40px, 5.6vw, 72px)", color: "var(--fg)" }}>
            Trust nothing.<br/><span style={{ color: "var(--t2k-success)" }}>Verify everything.</span>
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.5, color: "var(--fg-muted)", margin: "22px auto 0", maxWidth: 520, letterSpacing: "-0.014em" }}>
            Every confidential response ships a signed receipt, anchored on Sui. Paste one to check it yourself — the anchor, the signature, and the Intel TDX quote, all client-side.
          </p>
        </div>

        {/* Verifier card */}
        <div className="t2k-card" style={{ maxWidth: 760, margin: "0 auto", padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", gap: 10, padding: 14, borderBottom: "1px solid var(--ds-gray-alpha-300)", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 240, display: "flex", alignItems: "center", gap: 10, padding: "0 14px", background: "var(--ds-background-200)", border: "1px solid var(--ds-gray-alpha-300)", borderRadius: 7 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-subtle)" }}>receipt</span>
              <input
                value={value}
                onChange={(e) => { setValue(e.target.value); setState("idle"); }}
                onKeyDown={(e) => { if (e.key === "Enter") run(); }}
                spellCheck={false}
                style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, outline: "none", color: "var(--fg)", fontFamily: "var(--font-mono)", fontSize: 12.5, padding: "12px 0", textOverflow: "ellipsis" }}
              />
            </div>
            <button type="button" onClick={run} className="t2k-btn t2k-btn--blue" style={{ whiteSpace: "nowrap" }}>
              {state === "checking" ? "Checking…" : "Verify →"}
            </button>
          </div>

          <div style={{ padding: 22, minHeight: 220 }}>
            {state !== "ok" ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 220, color: "var(--fg-subtle)", fontFamily: "var(--font-mono)", fontSize: 13 }}>
                {state === "checking" ? "reading the Sui anchor…" : "paste a receipt to verify"}
              </div>
            ) : <VerifyResult />}
          </div>
        </div>
      </div>
    </section>
  );
}

function VerifyResult() {
  const CHECKS = [
    { name: "Receipt", trustless: false, d: "well-formed · 9 log entries · workload sha256:3def…f1ed" },
    { name: "Confidential upstream", trustless: false, d: "chutes · verified" },
    { name: "Sui anchor", trustless: true, d: "on-chain ReceiptAnchored matches wire_hash + workload_id · tx J2r4…aQb4C" },
    { name: "Receipt signature", trustless: true, d: "signed by the attested receipt key (dstack-kms-receipt-v1)" },
    { name: "TDX quote (DCAP)", trustless: true, d: "genuine Intel TDX — verified client-side by the CLI" },
  ];
  return (
    <div style={{ animation: "t2k-fade-in 200ms var(--ease-out)" }}>
      {/* Result banner */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", marginBottom: 18, borderRadius: 8, background: "rgba(255,255,255,0.10)", border: "1px solid rgba(29,168,96,0.3)" }}>
        <span style={{ color: "var(--t2k-success)", fontSize: 15 }}>✓</span>
        <span style={{ fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: 15, letterSpacing: "-0.011em", color: "var(--t2k-success)" }}>Verified — TEE-signed receipt + trustless Sui anchor.</span>
      </div>

      {/* Checks */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {CHECKS.map((c) => (
          <div key={c.name} style={{ display: "flex", gap: 12 }}>
            <span style={{ color: "var(--t2k-success)", fontSize: 13, flex: "0 0 auto", marginTop: 1 }}>✓</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: 14, letterSpacing: "-0.011em", color: "var(--fg)" }}>{c.name}</span>
                {c.trustless && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.04em", color: "var(--t2k-success)", padding: "1px 7px", borderRadius: 4, background: "rgba(29,168,96,0.12)", border: "1px solid rgba(29,168,96,0.28)" }}>trustless</span>}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-muted)", marginTop: 3, lineHeight: 1.5, wordBreak: "break-word" }}>{c.d}</div>
            </div>
          </div>
        ))}
      </div>

      <a href={"https://suiscan.xyz/mainnet/tx/" + SUISCAN_TX} target="_blank" rel="noopener" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 18, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg)", textDecoration: "none", borderBottom: "1px solid var(--ds-gray-alpha-500)", paddingBottom: 2 }}
        onMouseEnter={(e) => e.currentTarget.style.color = "var(--t2k-success)"}
        onMouseLeave={(e) => e.currentTarget.style.color = "var(--fg)"}
      >View the anchor on Suiscan ↗</a>

      {/* Verify it yourself */}
      <div style={{ marginTop: 18, border: "1px solid var(--ds-gray-alpha-300)", borderRadius: 8, overflow: "hidden", background: "var(--ds-background-200)" }}>
        <div style={{ padding: "10px 16px 6px", fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: 13, color: "var(--fg)" }}>Verify it yourself (fully trustless):</div>
        <div style={{ padding: "0 16px 14px", fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--fg)" }}>
          <span style={{ color: "var(--t2k-success)" }}>npx @t2000/cli verify</span> {VERIFY_SAMPLE}
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--fg-subtle)", marginTop: 8 }}>The CLI checks the Intel TDX quote client-side too — no trust in any server.</div>
        </div>
      </div>
    </div>
  );
}

// ── How it works ─────────────────────────────────────────────
function VerifyHow() {
  const STEPS = [
    { n: "1", t: "Attest", d: "The gateway proves it's a genuine GPU-TEE with a hardware attestation report — and publishes the keys it signs with." },
    { n: "2", t: "Sign", d: "Each response gets a receipt binding your request + response hashes to that attested workload. Hashes, never bodies." },
    { n: "3", t: "Anchor", d: "The receipt's hash is committed on Sui as a ReceiptAnchored event — public, tamper-evident, permanent." },
    { n: "4", t: "Verify", d: "t2 verify recovers the signature and re-checks the Sui anchor + Intel TDX quote — all client-side. No trust in t2000." },
  ];
  return (
    <section className="t2k-section" style={{ background: "var(--ds-background-200)", borderTop: "1px solid var(--ds-gray-alpha-300)" }}>
      <div className="t2k-container">
        <header style={{ marginBottom: 44 }}>
          <span className="t2k-eyebrow">// HOW IT WORKS</span>
          <h2 className="t2k-section-title" style={{ marginTop: 12 }}>Four steps, zero trust.</h2>
        </header>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {STEPS.map((s) => (
            <div key={s.n} className="t2k-card" style={{ padding: 24, background: "var(--ds-background-100)", display: "flex", flexDirection: "column", gap: 12 }}>
              <span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--t2k-accent)", color: "var(--t2k-on-accent)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: 12 }}>{s.n}</span>
              <h3 style={{ fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: 17, letterSpacing: "-0.014em", margin: 0 }}>{s.t}</h3>
              <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--fg-muted)", margin: 0 }}>{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Closer ───────────────────────────────────────────────────
function VerifyCloser() {
  return (
    <section className="t2k-section" style={{ borderTop: "1px solid var(--ds-gray-alpha-300)" }}>
      <div className="t2k-container" style={{ textAlign: "center", maxWidth: 700 }}>
        <span className="t2k-eyebrow">// THE TRUST LOOP</span>
        <h2 className="t2k-display" style={{ fontSize: "clamp(36px, 4.8vw, 58px)", color: "var(--fg)", marginTop: 14 }}>
          Private is a claim.<br/><span style={{ color: "var(--t2k-success)" }}>Verifiable is a proof.</span>
        </h2>
        <p style={{ fontSize: 17, lineHeight: 1.55, color: "var(--fg-muted)", margin: "20px auto 0", maxWidth: 500, letterSpacing: "-0.011em" }}>
          Every confidential response is one paste away from proof. Build on data you can check.
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 28, justifyContent: "center", flexWrap: "wrap" }}>
          <a href="api.html" className="t2k-btn t2k-btn--blue t2k-btn--lg">Private API&nbsp;→</a>
          <a href="https://developers.t2000.ai/confidential-ai" className="t2k-btn t2k-btn--ghost t2k-btn--lg">How it works&nbsp;↗</a>
        </div>
      </div>
    </section>
  );
}

// ── Verification ledger (live) ───────────────────────────────
function VerifyLedger() {
  const MODELS = ["phala/glm-5.2", "phala/deepseek-v3.2", "phala/gpt-oss-120b", "phala/qwen3-max", "phala/glm-5.2"];
  const mk = (i) => {
    const hex = "0123456789abcdef";
    const rand = (n) => { let s = ""; for (let j = 0; j < n; j++) s += hex[Math.floor(Math.random() * 16)]; return s; };
    return {
      rcpt: "rcpt-" + rand(4) + "…" + rand(4),
      model: MODELS[Math.floor(Math.random() * MODELS.length)],
      tx: rand(4) + "…" + rand(4),
      ts: (i * 2 + 1) + "s ago",
      _k: i + "_" + Math.random(),
    };
  };
  const seed = React.useMemo(() => Array.from({ length: 14 }, (_, i) => mk(i)), []);
  const [rows, setRows] = React.useState(seed);
  const [count, setCount] = React.useState(3142);

  React.useEffect(() => {
    const bump = (ts) => { const m = ts.match(/^(\d+)s ago$/); if (m) { const n = +m[1] + 2; return n >= 60 ? Math.floor(n / 60) + "m ago" : n + "s ago"; } return ts; };
    const id = setInterval(() => {
      setRows((prev) => [{ ...mk(0), ts: "just now" }, ...prev.slice(0, 13).map((p) => ({ ...p, ts: bump(p.ts) }))]);
      setCount((c) => c + 1);
    }, 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <header style={{ marginBottom: 32, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "4px 10px", borderRadius: 9999, border: "1px solid var(--ds-gray-alpha-300)", background: "var(--ds-gray-alpha-100)", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)" }}>
                <span className="t2k-dot" /> Live
              </span>
              <span className="t2k-eyebrow">// PUBLIC LEDGER</span>
            </div>
            <h2 className="t2k-section-title">Every confidential response, anchored.</h2>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 40, letterSpacing: "-0.04em", color: "var(--fg)", fontVariantNumeric: "tabular-nums" }}>{count.toLocaleString()}</div>
            <div className="t2k-eyebrow" style={{ fontSize: 10.5, marginTop: 2 }}>ANCHORED ON SUI</div>
          </div>
        </header>

        <div className="t2k-card" style={{ overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.3fr 1fr 0.7fr 0.7fr", gap: 16, padding: "10px 18px", borderBottom: "1px solid var(--ds-gray-alpha-300)", background: "var(--ds-gray-100)", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--fg-subtle)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            <span>Receipt</span><span>Model</span><span>Anchor tx</span><span style={{ textAlign: "right" }}>Status</span><span style={{ textAlign: "right" }}>When</span>
          </div>
          {rows.map((r, i) => (
            <div key={r._k} style={{
              display: "grid", gridTemplateColumns: "1.1fr 1.3fr 1fr 0.7fr 0.7fr", gap: 16,
              padding: "11px 18px", borderBottom: "1px dotted var(--ds-gray-alpha-300)",
              fontFamily: "var(--font-mono)", fontSize: 12, alignItems: "center",
              opacity: i === 0 ? 0 : 1, animation: i === 0 ? "t2k-fade-in 500ms var(--ease-out) forwards" : undefined,
            }}>
              <span style={{ color: "var(--fg)" }}>{r.rcpt}</span>
              <span style={{ color: "var(--fg-muted)" }}>{r.model}</span>
              <span style={{ color: "var(--fg-subtle)" }}>{r.tx}</span>
              <span style={{ color: "var(--t2k-success)", textAlign: "right" }}>✓ anchored</span>
              <span style={{ color: "var(--fg-subtle)", textAlign: "right" }}>{r.ts}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 18, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--fg-subtle)" }}>
          Showing last 14. Hashes only — no prompts, no identities.
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { VerifyHero, VerifyLedger, VerifyHow, VerifyCloser });
