interface Provider {
  name: string;
  pkg: string;
  model: string;
}

const PROVIDERS: Provider[] = [
  { name: "Anthropic", pkg: "@ai-sdk/anthropic", model: "claude-sonnet-4" },
  { name: "OpenAI", pkg: "@ai-sdk/openai", model: "gpt-4o" },
  { name: "xAI", pkg: "@ai-sdk/xai", model: "grok-4" },
  { name: "Groq", pkg: "@ai-sdk/groq", model: "llama-3.3-70b" },
];

export function EngineRuntime() {
  return (
    <section
      className="t2k-section border-t border-b"
      style={{
        background: "var(--ds-background-200)",
        borderTopColor: "var(--ds-gray-alpha-300)",
        borderBottomColor: "var(--ds-gray-alpha-300)",
      }}
    >
      <div className="t2k-container">
        <header className="mb-12 max-w-[720px]">
          <span className="t2k-eyebrow">{"// RUNTIME"}</span>
          <h2 className="t2k-section-title mt-3">
            Any provider.
            <br />
            <span style={{ color: "var(--fg-muted)" }}>Same engine.</span>
          </h2>
          <p className="t2k-section-sub">
            Built on the Vercel AI SDK. Switch models in one line.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PROVIDERS.map((p) => (
            <div
              key={p.name}
              className="t2k-card flex flex-col gap-3.5"
              style={{
                padding: "18px 18px",
                background: "var(--bg-elevated)",
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="text-[15px] font-semibold"
                  style={{
                    letterSpacing: "-0.018em",
                    color: "var(--fg)",
                  }}
                >
                  {p.name}
                </span>
                <span
                  className="font-mono text-[9.5px]"
                  style={{
                    color: "var(--fg-subtle)",
                    letterSpacing: "0.06em",
                  }}
                >
                  {p.model}
                </span>
              </div>
              <div
                className="overflow-hidden whitespace-nowrap rounded font-mono text-[10.5px]"
                style={{
                  padding: "8px 10px",
                  background: "var(--ds-background-200)",
                  border: "1px solid var(--ds-gray-alpha-300)",
                  color: "var(--fg-muted)",
                  textOverflow: "ellipsis",
                }}
              >
                {p.pkg}
              </div>
            </div>
          ))}
        </div>

        <div
          className="mt-5 flex flex-wrap items-center justify-between gap-3.5 rounded-lg border border-dashed font-mono text-[12.5px]"
          style={{
            padding: "16px 20px",
            borderColor: "var(--ds-gray-alpha-400)",
            color: "var(--fg-muted)",
          }}
        >
          <span style={{ color: "var(--fg-subtle)" }}>Stays identical →</span>
          <span style={{ color: "var(--fg)" }}>26 tools</span>
          <span className="opacity-30">·</span>
          <span style={{ color: "var(--fg)" }}>12 guards</span>
          <span className="opacity-30">·</span>
          <span style={{ color: "var(--fg)" }}>audit log</span>
          <span className="opacity-30">·</span>
          <span style={{ color: "var(--fg)" }}>session state</span>
          <span className="opacity-30">·</span>
          <span style={{ color: "var(--fg)" }}>1-tap approvals</span>
        </div>
      </div>
    </section>
  );
}
