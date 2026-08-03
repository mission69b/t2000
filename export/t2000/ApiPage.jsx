// ============================================================
// ApiPage — Private & Confidential API (api.t2000.ai)
// OpenAI-compatible inference. Private by default (ZDR, every model);
// verifiably confidential (GPU-TEE + Sui-anchored receipts) on phala/*.
// Sections: Hero (confidential verify flow) · Two tiers · x402 no-key ·
// Verifiable ladder · Integrations · Closer.
// ============================================================

// ── Hero ─────────────────────────────────────────────────────
function ApiHero() {
  return (
    <section style={{ position: "relative", padding: "92px 0 64px", borderBottom: "1px solid var(--ds-gray-alpha-300)", overflow: "hidden" }}>
      <div aria-hidden="true" style={{
        position: "absolute", right: "-8%", top: "6%", width: 720, height: 520,
        background: "radial-gradient(45% 50% at 50% 50%, rgba(255,255,255,0.10) 0%, transparent 70%)",
        filter: "blur(24px)", pointerEvents: "none",
      }} />
      <div className="t2k-container" style={{ position: "relative" }}>
        <a href="index.html" style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 13, color: "var(--fg-muted)", textDecoration: "none",
          fontFamily: "var(--font-mono)", letterSpacing: "0.01em", marginBottom: 26,
        }}
          onMouseEnter={(e) => e.currentTarget.style.color = "var(--fg)"}
          onMouseLeave={(e) => e.currentTarget.style.color = "var(--fg-muted)"}
        ><span style={{ opacity: 0.6 }}>←</span> t2000.ai</a>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.02fr) minmax(0,1fr)", gap: 56, alignItems: "center" }}>
          <div>
            <div className="t2k-eyebrow" style={{ marginBottom: 22 }}>// PRIVATE &amp; CONFIDENTIAL API · api.t2000.ai</div>
            <h1 className="t2k-display" style={{ fontSize: "clamp(42px, 6vw, 76px)", color: "var(--fg)" }}>
              Every model.<br/>
              <span style={{ color: "var(--t2k-accent)" }}>Private by default.</span>
            </h1>
            <p style={{ fontSize: 18, lineHeight: 1.5, color: "var(--fg-muted)", maxWidth: 512, margin: "26px 0 0", letterSpacing: "-0.014em" }}>
              One key. An OpenAI-compatible endpoint. Point any OpenAI SDK at it — every model <span style={{ color: "var(--fg)" }}>private by default</span>, verifiably <span style={{ color: "var(--fg)" }}>confidential</span> when it matters. Paid per token in USDC.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 32, flexWrap: "wrap" }}>
              <a href="https://developers.t2000.ai/private-api" className="t2k-btn t2k-btn--blue t2k-btn--lg">Read the docs&nbsp;↗</a>
              <a href="verify.html" className="t2k-btn t2k-btn--ghost t2k-btn--lg">Verify a receipt&nbsp;→</a>
            </div>
            <div style={{ display: "flex", gap: 22, marginTop: 30, flexWrap: "wrap" }}>
              {[["ZDR", "every model private"], ["GPU-TEE", "confidential tier"], ["Sui-anchored", "verify every response"]].map(([a, b]) => (
                <div key={b} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, color: "var(--fg)", letterSpacing: "-0.01em" }}>{a}</span>
                  <span style={{ fontSize: 12.5, color: "var(--fg-subtle)" }}>{b}</span>
                </div>
              ))}
            </div>
          </div>
          <ApiHeroTerminal />
        </div>
      </div>
    </section>
  );
}

// Confidential path: a phala/* call returns a receipt; t2 verify checks
// the Sui anchor + receipt signature + TDX quote — all client-side.
function ApiHeroTerminal() {
  const LINES = [
    { t: "cmd",  s: "t2 chat --model phala/glm-5.2 \\" },
    { t: "cont", s: "  \"Summarize the filing.\"" },
    { t: "gap",  s: "" },
    { t: "conf", s: "🔒 confidential · attested · enclave verified" },
    { t: "out",  s: "\"Here's the summary you asked for …\"" },
    { t: "rcpt", s: "x-receipt-id: rcpt-9f4c…a21e" },
    { t: "gap",  s: "" },
    { t: "cmd",  s: "t2 verify rcpt-9f4c…a21e" },
    { t: "ok",   s: "✓ Sui anchor (trustless)        matches" },
    { t: "ok",   s: "✓ Receipt signature (trustless) attested key" },
    { t: "ok",   s: "✓ TDX quote (DCAP)              genuine Intel TDX" },
    { t: "res",  s: "RESULT: ✓ verified — all checked client-side" },
  ];
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    if (n >= LINES.length) { const r = setTimeout(() => setN(0), 2800); return () => clearTimeout(r); }
    const d = LINES[n].t === "gap" ? 120 : 420;
    const r = setTimeout(() => setN(n + 1), d);
    return () => clearTimeout(r);
  }, [n]);
  const color = (t) => (
    t === "rcpt" ? "var(--t2k-accent)" :
    t === "conf" || t === "ok" || t === "res" ? "var(--t2k-success)" :
    t === "out" ? "var(--fg)" :
    t === "cmd" ? "var(--fg)" : "var(--fg-muted)"
  );
  return (
    <div className="t2k-card" style={{ padding: 0, overflow: "hidden", background: "var(--ds-background-100)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: "1px solid var(--ds-gray-alpha-300)" }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#3A3A3A" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#4A4A4A" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#5A5A5A" }} />
        <span style={{ marginLeft: 8, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-subtle)" }}>~ /agent</span>
        <span style={{ flex: 1 }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-subtle)" }}>
          <span className="t2k-dot" /> api.t2000.ai
        </span>
      </div>
      <div style={{ padding: "18px 18px 22px", fontFamily: "var(--font-mono)", fontSize: 12.5, lineHeight: 1.75, minHeight: 340 }}>
        {LINES.slice(0, n).map((l, i) => (
          <div key={i} style={{ color: color(l.t), whiteSpace: "pre-wrap", minHeight: l.t === "gap" ? 10 : "auto" }}>
            {l.t === "cmd" && <span style={{ color: "var(--fg-subtle)", marginRight: 6 }}>$</span>}
            {l.s}
          </div>
        ))}
        {n < LINES.length && <span style={{ display: "inline-block", width: 7, height: 15, background: "var(--t2k-accent)", verticalAlign: "middle", animation: "t2k-blink 1s steps(1) infinite" }} />}
      </div>
    </div>
  );
}

// ── Two tiers / model catalog ────────────────────────────────
function ApiModels() {
  const TIERS = [
    {
      label: "PRIVATE", tag: "every model · ZDR", accent: false,
      blurb: "Zero data retention — providers are contractually bound not to store or train on your prompts.",
      models: ["anthropic/claude-sonnet-5", "openai/gpt-oss-120b", "zai/glm-5.2", "deepseek/deepseek-v3.2"],
    },
    {
      label: "CONFIDENTIAL", tag: "phala/* · verifiable", accent: true,
      blurb: "Runs in a verified GPU-TEE; every response carries a signed receipt anchored on Sui you can check yourself.",
      models: ["phala/glm-5.2", "phala/deepseek-v3.2", "phala/gpt-oss-120b", "phala/qwen3-max"],
    },
  ];
  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <header style={{ marginBottom: 40, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
          <div>
            <span className="t2k-eyebrow">// ONE ENDPOINT · TWO POSTURES</span>
            <h2 className="t2k-section-title" style={{ marginTop: 12 }}>Private by default.<br/>Confidential when it matters.</h2>
          </div>
          <p style={{ fontSize: 16, lineHeight: 1.55, color: "var(--fg-muted)", margin: 0, maxWidth: 400, letterSpacing: "-0.011em" }}>
            Namespaced model IDs (<code style={{ fontFamily: "var(--font-mono)", color: "var(--fg)" }}>provider/model</code>). The live catalog, pricing, and each model's <code style={{ fontFamily: "var(--font-mono)", color: "var(--fg)" }}>private</code>/<code style={{ fontFamily: "var(--font-mono)", color: "var(--fg)" }}>confidential</code> tag ride <code style={{ fontFamily: "var(--font-mono)", color: "var(--fg)" }}>GET /v1/models</code> — public, no key.
          </p>
        </header>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {TIERS.map((g) => (
            <div key={g.label} className="t2k-card" style={{ padding: 26, display: "flex", flexDirection: "column", gap: 16, borderColor: g.accent ? "rgba(29,168,96,0.35)" : undefined, background: g.accent ? "rgba(29,168,96,0.04)" : undefined }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.08em", color: g.accent ? "var(--t2k-success)" : "var(--fg)" }}>{g.label}</span>
                <span className="t2k-mono-tag" style={g.accent ? { color: "var(--t2k-success)" } : undefined}>{g.tag}</span>
              </div>
              <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--fg-muted)", margin: 0 }}>{g.blurb}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 2 }}>
                {g.models.map((m) => (
                  <div key={m} style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--fg)", letterSpacing: "-0.005em" }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: g.accent ? "var(--t2k-success)" : "var(--t2k-accent)", flex: "0 0 auto" }} />
                    {m}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, padding: "16px 20px", border: "1px solid var(--ds-gray-alpha-300)", borderRadius: 8, background: "var(--ds-background-200)", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <span className="t2k-mono-tag t2k-mono-tag--blue">GET /v1/models</span>
          <span style={{ fontSize: 14, color: "var(--fg-muted)", letterSpacing: "-0.011em" }}>
            Metered per token from one credit balance — no subscription, no per-provider account. Settled in USDC.
          </span>
        </div>
      </div>
    </section>
  );
}

// ── Pay-per-call over x402 (no key) ──────────────────────────
function ApiX402() {
  return (
    <section className="t2k-section" style={{ borderTop: "1px solid var(--ds-gray-alpha-300)" }}>
      <div className="t2k-container">
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.1fr)", gap: 48, alignItems: "center" }}>
          <div>
            <span className="t2k-eyebrow">// NO KEY · NO ACCOUNT</span>
            <h2 className="t2k-section-title" style={{ marginTop: 12 }}>Or pay per call<br/>over x402.</h2>
            <p style={{ fontSize: 15.5, lineHeight: 1.65, color: "var(--fg-muted)", margin: "16px 0 0", maxWidth: 440, letterSpacing: "-0.011em" }}>
              The Private API is a first-party service on the gateway, so an agent can pay per call from its wallet's USDC — gasless, no key. The gateway handles <code style={{ fontFamily: "var(--font-mono)", color: "var(--fg)" }}>402 → pay → retry</code>. The agent-native path.
            </p>
            <a href="agent-payments.html" style={{
              marginTop: 20, fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--fg)",
              textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6,
              borderBottom: "1px solid var(--ds-gray-alpha-500)", paddingBottom: 2,
            }}
              onMouseEnter={(e) => e.currentTarget.style.color = "var(--t2k-accent)"}
              onMouseLeave={(e) => e.currentTarget.style.color = "var(--fg)"}
            >See Agent Payments →</a>
          </div>
          <div className="t2k-card" style={{ padding: 0, overflow: "hidden", background: "var(--ds-background-200)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--ds-gray-alpha-300)", background: "var(--ds-gray-100)" }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#3A3A3A" }} />
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#4A4A4A" }} />
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#5A5A5A" }} />
              <span style={{ marginLeft: 8, fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--fg-subtle)" }}>~ /agent</span>
            </div>
            <pre style={{ margin: 0, padding: "18px 20px", fontFamily: "var(--font-mono)", fontSize: 12.5, lineHeight: 1.8, color: "var(--fg)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              <span style={{ color: "var(--fg-subtle)" }}>$ </span><span style={{ color: "var(--t2k-accent)" }}>t2 pay</span> https://x402.t2000.ai/t2000/v1/chat/completions <span style={{ color: "var(--fg-subtle)" }}>\</span>{"\n"}
              {"  "}<span style={{ color: "var(--fg-muted)" }}>--data</span> <span style={{ color: "var(--ds-amber-700)" }}>'{"{"}"model":"zai/glm-5.2","messages":[…]{"}"}'</span> <span style={{ color: "var(--fg-subtle)" }}>\</span>{"\n"}
              {"  "}<span style={{ color: "var(--fg-muted)" }}>--max-price</span> <span style={{ color: "var(--t2k-success)" }}>0.10</span>
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Verifiable ladder ────────────────────────────────────────
function ApiPrivacy() {
  const RUNGS = [
    { k: "01", name: "Private by default", desc: "Every model is zero data retention — prompts and outputs are never stored, logged, or trained on." },
    { k: "02", name: "Confidential tier", desc: "phala/* models run in a verified GPU-TEE. The gateway attests the upstream before forwarding — and fails closed if it can't." },
    { k: "03", name: "Signed, Sui-anchored receipts", desc: "Every confidential response commits its hash on-chain — tamper-evident and publicly timestamped." },
    { k: "04", name: "Verify it yourself", desc: "t2 verify checks the Sui anchor, receipt signature, and TDX quote — all client-side. Check the proofs yourself." },
  ];
  return (
    <section className="t2k-section" style={{ borderTop: "1px solid var(--ds-gray-alpha-300)", background: "var(--ds-background-200)" }}>
      <div className="t2k-container">
        <header style={{ marginBottom: 40, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
          <div>
            <span className="t2k-eyebrow">// VERIFIABLE, NOT JUST CLAIMED</span>
            <h2 className="t2k-section-title" style={{ marginTop: 12 }}>The only Sui-native verifiable<br/>confidential inference.</h2>
          </div>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--fg-muted)", margin: 0, maxWidth: 360, letterSpacing: "-0.011em" }}>
            Anchored on Sui and read straight from a fullnode — so we can't forge it.
          </p>
        </header>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {RUNGS.map((r) => (
            <div key={r.k} className="t2k-card" style={{ padding: "26px 28px", display: "flex", gap: 20, background: "var(--ds-background-100)" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--t2k-accent)", flex: "0 0 auto" }}>{r.k}</span>
              <div>
                <h3 style={{ fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: 18, letterSpacing: "-0.017em", margin: "0 0 8px" }}>{r.name}</h3>
                <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--fg-muted)", margin: 0 }}>{r.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Integrations ─────────────────────────────────────────────
function ApiIntegrations() {
  const TOOLS = [
    "OpenAI SDK", "Cursor", "Codex CLI", "Vercel AI SDK",
    "LangChain", "LiteLLM", "Cline", "Aider",
  ];
  return (
    <section className="t2k-section" style={{ borderTop: "1px solid var(--ds-gray-alpha-300)" }}>
      <div className="t2k-container">
        <header style={{ marginBottom: 36 }}>
          <span className="t2k-eyebrow">// OPENAI-COMPATIBLE · DROP-IN</span>
          <h2 className="t2k-section-title" style={{ marginTop: 12 }}>Point any OpenAI client at it.</h2>
          <p style={{ fontSize: 15.5, lineHeight: 1.6, color: "var(--fg-muted)", margin: "14px 0 0", maxWidth: 560, letterSpacing: "-0.011em" }}>
            The API speaks the OpenAI Chat Completions format. Set two environment variables and most tools repoint with zero code changes — private by default across every model.
          </p>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16, alignItems: "stretch" }}>
          <div className="t2k-card" style={{ padding: 0, overflow: "hidden", background: "var(--ds-background-200)" }}>
            <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--ds-gray-alpha-300)", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-subtle)", letterSpacing: "0.04em" }}>THE UNIVERSAL SWAP</div>
            <pre style={{ margin: 0, padding: "20px 20px", fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.9, color: "var(--fg)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              <span style={{ color: "var(--fg-subtle)" }}>export </span>OPENAI_BASE_URL=<span style={{ color: "var(--ds-amber-700)" }}>"https://api.t2000.ai/v1"</span>{"\n"}
              <span style={{ color: "var(--fg-subtle)" }}>export </span>OPENAI_API_KEY=<span style={{ color: "var(--ds-amber-700)" }}>"sk-…"</span>
            </pre>
            <div style={{ padding: "13px 20px", borderTop: "1px solid var(--ds-gray-alpha-300)", fontSize: 12.5, lineHeight: 1.55, color: "var(--fg-muted)" }}>
              Create a key + add credit at <span style={{ color: "var(--fg)" }}>agents.t2000.ai/manage</span>. Then pick any model ID from the catalog.
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
              {TOOLS.map((t) => (
                <div key={t} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "13px 16px", border: "1px solid var(--ds-gray-alpha-400)", borderRadius: 8,
                  background: "var(--ds-background-200)", fontSize: 14, color: "var(--fg)", letterSpacing: "-0.011em",
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--t2k-accent)", flex: "0 0 auto" }} />
                  {t}
                </div>
              ))}
            </div>
            <div style={{ padding: "13px 16px", border: "1px solid var(--ds-gray-alpha-300)", borderRadius: 8, background: "var(--ds-background-200)", fontSize: 12.5, lineHeight: 1.55, color: "var(--fg-muted)" }}>
              Anthropic-format tools (Claude Code) work today via a translation proxy — native <code style={{ fontFamily: "var(--font-mono)", color: "var(--fg)" }}>/v1/messages</code> is on the roadmap.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Closer ───────────────────────────────────────────────────
function ApiCloser() {
  const [copied, setCopied] = React.useState(false);
  const snippet = "export OPENAI_BASE_URL=https://api.t2000.ai/v1";
  const onCopy = () => { navigator.clipboard?.writeText(snippet); setCopied(true); setTimeout(() => setCopied(false), 1600); };
  return (
    <section className="t2k-section" style={{ borderTop: "1px solid var(--ds-gray-alpha-300)" }}>
      <div className="t2k-container" style={{ textAlign: "center", maxWidth: 720 }}>
        <span className="t2k-eyebrow">// GET A KEY</span>
        <h2 className="t2k-display" style={{ fontSize: "clamp(38px, 5vw, 62px)", color: "var(--fg)", marginTop: 14 }}>
          Every model, private.<br/><span style={{ color: "var(--t2k-accent)" }}>One base URL.</span>
        </h2>
        <p style={{ fontSize: 17, lineHeight: 1.55, color: "var(--fg-muted)", margin: "20px auto 0", maxWidth: 520, letterSpacing: "-0.011em" }}>
          Sign in at the console to mint a key + add credit — or fund from the CLI wallet in one command: <code style={{ fontFamily: "var(--font-mono)", color: "var(--fg)" }}>t2 agent onboard --fund 5</code>.
        </p>
        <button type="button" onClick={onCopy} style={{
          margin: "30px auto 0", display: "inline-flex", alignItems: "center", gap: 12,
          padding: "14px 20px", borderRadius: 8, cursor: "pointer",
          background: "var(--ds-background-200)", border: "1px solid var(--ds-gray-alpha-400)",
          fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--fg)",
        }}>
          <span style={{ color: "var(--fg-subtle)" }}>$</span>
          <span>{snippet}</span>
          <span style={{ color: copied ? "var(--t2k-accent)" : "var(--fg-subtle)", fontSize: 12, marginLeft: 4 }}>{copied ? "copied" : "copy"}</span>
        </button>
        <div style={{ display: "flex", gap: 10, marginTop: 26, justifyContent: "center", flexWrap: "wrap" }}>
          <a href="agents/manage.html" className="t2k-btn t2k-btn--blue t2k-btn--lg">Open the console&nbsp;↗</a>
          <a href="verify.html" className="t2k-btn t2k-btn--ghost t2k-btn--lg">Verify a receipt&nbsp;→</a>
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { ApiHero, ApiModels, ApiX402, ApiPrivacy, ApiIntegrations, ApiCloser });
