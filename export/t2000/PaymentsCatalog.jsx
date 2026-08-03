// ============================================================
// PaymentsCatalog — categorized service catalog
// Goes one step deeper than the homepage teaser: 13 categories with
// counts and named providers. Designed to feel like a directory you
// can scan, not a marketing illustration.
// ============================================================
function PaymentsCatalog() {
  const categories = [
    { cat: "AI Chat",          count: 9,  examples: "OpenAI · Anthropic · DeepSeek · Mistral · Together · Groq · Cohere · Perplexity · xAI" },
    { cat: "Web Search",       count: 10, examples: "Brave · Tavily · Exa · You.com · Serper · Perplexity Sonar · Bing · Kagi · SerpAPI · Linkup" },
    { cat: "Image Generation", count: 9,  examples: "DALL-E 3 · gpt-image-1 · FAL Flux · Stability · Replicate · Midjourney · Imagen · Recraft · Ideogram" },
    { cat: "Data",             count: 9,  examples: "Maps · Weather · Crypto · Stocks · FX · Flights · Sports · News · Sui RPC" },
    { cat: "Web Scraping",     count: 8,  examples: "Firecrawl · Jina · Browserbase · ScrapingBee · Apify · ZenRows · Spider · Crawlbase" },
    { cat: "Audio + TTS",      count: 7,  examples: "Whisper · AssemblyAI · ElevenLabs · OpenAI TTS · Hume · Cartesia · Inworld" },
    { cat: "Embeddings",       count: 6,  examples: "OpenAI · Cohere · Voyage · Mistral · Jina · Together" },
    { cat: "Intelligence",     count: 4,  examples: "Wolfram · Perplexity Research · Riza · BlockVision" },
    { cat: "Translation",      count: 3,  examples: "DeepL · Google · Lilt" },
    { cat: "Email + Push",     count: 3,  examples: "Resend · Loops · Pushcut" },
    { cat: "Physical Mail",    count: 3,  examples: "Lob postcards · Lob letters · PostGrid" },
    { cat: "Commerce",         count: 3,  examples: "Stripe · Square · NMI" },
    { cat: "Tools",            count: 3,  examples: "URL screenshot · PDF render · Cron job" },
  ];

  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <header style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)",
          gap: 48, alignItems: "end",
          marginBottom: 48,
        }}>
          <div>
            <span className="t2k-eyebrow">// THE CATALOG</span>
            <h2 className="t2k-section-title" style={{ marginTop: 14, lineHeight: 1.0 }}>
              Every major<br/>
              <span style={{ color: "var(--fg-faint)" }}>AI + data API.</span>
            </h2>
          </div>
          <div>
            <p style={{
              fontSize: 16, lineHeight: 1.55,
              color: "var(--fg-muted)", margin: 0,
              letterSpacing: "-0.011em",
              maxWidth: 420,
            }}>
              Models, search, mail, scrapers — anything your agent needs to ship. Browse the live catalog at mpp.t2000.ai.
            </p>
          </div>
        </header>

        {/* 13 category cards in a 3-col grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 14,
        }}>
          {categories.map((c) => <CategoryCard key={c.cat} {...c} />)}
        </div>

        {/* Browse strip */}
        <a href="https://mpp.t2000.ai/services" style={{
          marginTop: 14,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "14px 18px",
          border: "1px dashed var(--ds-gray-alpha-400)",
          borderRadius: 8,
          color: "var(--fg)", textDecoration: "none",
          transition: "border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out)",
        }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--t2k-accent)"; e.currentTarget.style.background = "var(--t2k-accent-bg)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--ds-gray-alpha-400)"; e.currentTarget.style.background = "transparent"; }}
        >
          <div style={{
            display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
            fontFamily: "var(--font-mono)", fontSize: 13,
            color: "var(--fg-muted)",
          }}>
            <span style={{ color: "var(--fg)" }}>Full catalog</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>JSON</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>OpenAPI 3.1</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>llms.txt</span>
          </div>
          <span style={{
            fontFamily: "var(--font-sans)", fontSize: 13.5,
            fontWeight: 500, letterSpacing: "-0.011em",
            color: "var(--t2k-accent)",
            whiteSpace: "nowrap",
          }}>Open mpp.t2000.ai&nbsp;↗</span>
        </a>
      </div>
    </section>
  );
}

function CategoryCard({ cat, count, examples }) {
  return (
    <div className="t2k-card" style={{
      padding: "18px 18px",
      display: "flex", flexDirection: "column", gap: 8,
      transition: "border-color var(--dur-fast) var(--ease-out)",
    }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--ds-gray-alpha-500)"}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--ds-gray-alpha-400)"}
    >
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
      }}>
        <h3 style={{
          fontFamily: "var(--font-sans)", fontWeight: 600,
          fontSize: 17, letterSpacing: "-0.018em",
          margin: 0, color: "var(--fg)",
        }}>{cat}</h3>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 12,
          color: "var(--t2k-accent)",
          fontVariantNumeric: "tabular-nums",
        }}>{count}</span>
      </div>
      <p style={{
        fontFamily: "var(--font-mono)", fontSize: 11.5,
        lineHeight: 1.55, color: "var(--fg-subtle)",
        margin: 0,
        letterSpacing: "0.01em",
      }}>{examples}</p>
    </div>
  );
}

window.PaymentsCatalog = PaymentsCatalog;
