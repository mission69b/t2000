import { GATEWAY_URL } from "../../data/t2k";

interface Category {
  cat: string;
  count: number;
  examples: string;
}

const CATEGORIES: Category[] = [
  { cat: "AI Chat", count: 9, examples: "OpenAI · Anthropic · DeepSeek · Mistral · Together · Groq · Cohere · Perplexity · xAI" },
  { cat: "Web Search", count: 10, examples: "Brave · Tavily · Exa · You.com · Serper · Perplexity Sonar · Bing · Kagi · SerpAPI · Linkup" },
  { cat: "Image Generation", count: 9, examples: "DALL-E 3 · gpt-image-1 · FAL Flux · Stability · Replicate · Midjourney · Imagen · Recraft · Ideogram" },
  { cat: "Data", count: 9, examples: "Maps · Weather · Crypto · Stocks · FX · Flights · Sports · News · Sui RPC" },
  { cat: "Web Scraping", count: 8, examples: "Firecrawl · Jina · Browserbase · ScrapingBee · Apify · ZenRows · Spider · Crawlbase" },
  { cat: "Audio + TTS", count: 7, examples: "Whisper · AssemblyAI · ElevenLabs · OpenAI TTS · Hume · Cartesia · Inworld" },
  { cat: "Embeddings", count: 6, examples: "OpenAI · Cohere · Voyage · Mistral · Jina · Together" },
  { cat: "Intelligence", count: 4, examples: "Wolfram · Perplexity Research · Riza · BlockVision" },
  { cat: "Translation", count: 3, examples: "DeepL · Google · Lilt" },
  { cat: "Email + Push", count: 3, examples: "Resend · Loops · Pushcut" },
  { cat: "Physical Mail", count: 3, examples: "Lob postcards · Lob letters · PostGrid" },
  { cat: "Commerce", count: 3, examples: "Stripe · Square · NMI" },
  { cat: "Tools", count: 3, examples: "URL screenshot · PDF render · Cron job" },
];

export function PaymentsCatalog() {
  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <header className="mb-12 grid items-end gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <span className="t2k-eyebrow">{"// THE CATALOG · 13 CATEGORIES"}</span>
            <h2
              className="t2k-section-title mt-[22px]"
              style={{ lineHeight: 1.0 }}
            >
              Every major
              <br />
              <span style={{ color: "var(--fg-faint)" }}>AI + data API.</span>
            </h2>
          </div>
          <div>
            <p
              className="m-0 max-w-[420px] text-[16px] leading-[1.55]"
              style={{
                color: "var(--fg-muted)",
                letterSpacing: "-0.011em",
              }}
            >
              Pay-per-request to every major AI provider. USDC on Sui.
              Gasless. Live on{" "}
              <span style={{ color: "var(--fg)" }}>mpp.t2000.ai</span>.
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((c) => (
            <CategoryCard key={c.cat} {...c} />
          ))}
        </div>

        <a
          href={`${GATEWAY_URL}/services`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3.5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed px-[18px] py-3.5 no-underline transition-colors hover:!border-[var(--t2k-accent)] hover:!bg-[var(--t2k-accent-bg)]"
          style={{
            borderColor: "var(--ds-gray-alpha-400)",
            color: "var(--fg)",
          }}
        >
          <div
            className="flex flex-wrap items-center gap-3 font-mono text-[13px]"
            style={{ color: "var(--fg-muted)" }}
          >
            <span style={{ color: "var(--fg)" }}>Full catalog</span>
            <span className="opacity-50">·</span>
            <span>JSON</span>
            <span className="opacity-50">·</span>
            <span>OpenAPI 3.1</span>
            <span className="opacity-50">·</span>
            <span>llms.txt</span>
          </div>
          <span
            className="whitespace-nowrap text-[13.5px] font-medium tracking-tight"
            style={{ color: "var(--t2k-accent)" }}
          >
            Open mpp.t2000.ai&nbsp;↗
          </span>
        </a>
      </div>
    </section>
  );
}

function CategoryCard({ cat, count, examples }: Category) {
  return (
    <div
      className="t2k-card t2k-card-hover flex flex-col gap-2"
      style={{ padding: "18px 18px" }}
    >
      <div className="flex items-baseline justify-between">
        <h3
          className="m-0 text-[17px] font-semibold"
          style={{
            letterSpacing: "-0.018em",
            color: "var(--fg)",
          }}
        >
          {cat}
        </h3>
        <span
          className="t2k-tabular font-mono text-[12px]"
          style={{ color: "var(--t2k-accent)" }}
        >
          {count}
        </span>
      </div>
      <p
        className="m-0 font-mono text-[11.5px] leading-[1.55]"
        style={{
          color: "var(--fg-subtle)",
          letterSpacing: "0.01em",
        }}
      >
        {examples}
      </p>
    </div>
  );
}
