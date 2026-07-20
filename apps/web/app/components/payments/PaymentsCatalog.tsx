import { GATEWAY_URL } from "../../data/t2k";

interface Service {
  name: string;
  categories: string[];
}

interface CategoryRow {
  cat: string;
  count: number;
  examples: string;
}

// Display labels for the catalog's raw category keys. Unknown keys fall
// back to title-case so a new gateway category renders without a deploy
// here.
const CATEGORY_LABELS: Record<string, string> = {
  ai: "AI Models",
  media: "Media Generation",
  search: "Web Search",
  data: "Data APIs",
  web: "Web Scraping",
  translation: "Translation",
  communication: "Email",
  messaging: "Push",
  compute: "Code Execution",
  commerce: "Commerce",
  security: "Security",
  finance: "FX & Finance",
  utility: "Utilities",
};

const MAX_EXAMPLES = 6;

function labelFor(key: string): string {
  return (
    CATEGORY_LABELS[key] ??
    key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()
  );
}

// Category rows derived from the LIVE gateway catalog — never hand-written
// (the pre-2026-07-15 static table named services that were not on the
// rail; see CLAUDE.md "catalog tables come from live truth").
async function fetchCategories(): Promise<{
  rows: CategoryRow[];
  services: number | null;
}> {
  try {
    const res = await fetch(`${GATEWAY_URL}/api/services`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`gateway ${res.status}`);
    const services: Service[] = await res.json();

    const byCat = new Map<string, string[]>();
    for (const s of services) {
      for (const c of s.categories ?? []) {
        const list = byCat.get(c) ?? [];
        list.push(s.name);
        byCat.set(c, list);
      }
    }

    const rows = [...byCat.entries()]
      .map(([cat, names]) => ({
        cat: labelFor(cat),
        count: names.length,
        examples:
          names.slice(0, MAX_EXAMPLES).join(" · ") +
          (names.length > MAX_EXAMPLES
            ? ` · +${names.length - MAX_EXAMPLES} more`
            : ""),
      }))
      .sort((a, b) => b.count - a.count || a.cat.localeCompare(b.cat));

    return { rows, services: services.length };
  } catch {
    // Gateway unreachable at render time: show the section without
    // invented numbers — the full-catalog link is still the way in.
    return { rows: [], services: null };
  }
}

export async function PaymentsCatalog() {
  const { rows, services } = await fetchCategories();

  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <header className="mb-12 grid items-end gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <span className="t2k-eyebrow">
              {rows.length > 0
                ? `// THE CATALOG · ${rows.length} CATEGORIES`
                : "// THE CATALOG"}
            </span>
            <h2
              className="t2k-section-title mt-[22px]"
              style={{ lineHeight: 1.0 }}
            >
              Every service,
              <br />
              <span style={{ color: "var(--fg-faint)" }}>priced per call.</span>
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
              Pay-per-request to{" "}
              {services ? (
                <span style={{ color: "var(--fg)" }}>
                  {services} live services
                </span>
              ) : (
                "every major AI provider"
              )}
              . USDC on Sui. Gasless. Live on{" "}
              <span style={{ color: "var(--fg)" }}>mpp.t2000.ai</span>.
            </p>
          </div>
        </header>

        {rows.length > 0 ? (
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((c) => (
              <CategoryCard key={c.cat} {...c} />
            ))}
          </div>
        ) : null}

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

function CategoryCard({ cat, count, examples }: CategoryRow) {
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
