import { T2K_STORIES } from "../../data/t2k";
import { StoryCard } from "./StoryCard";

export function Stories() {
  const audric = T2K_STORIES.filter((s) => s.tag.startsWith("AUDRIC"));
  const mpp = T2K_STORIES.filter((s) => s.tag.startsWith("MPP"));

  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <header className="mb-12">
          <span className="t2k-eyebrow">{"// SIX PROMPTS · SHIPPING TODAY"}</span>
          <h2 className="t2k-section-title mt-[22px]">What your agent can do.</h2>
          <p className="t2k-section-sub">
            Six prompts. Real outputs. Copy any and paste into Claude Desktop.
          </p>
        </header>

        <div className="mb-4 flex items-center gap-3">
          <span
            className="block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--t2k-accent)" }}
          />
          <span
            className="t2k-eyebrow"
            style={{ color: "var(--t2k-accent)" }}
          >
            {"// AUDRIC · ON YOUR PORTFOLIO"}
          </span>
        </div>
        <div className="mb-14 grid gap-4 lg:grid-cols-2">
          {audric.map((s) => (
            <StoryCard key={s.n} s={s} />
          ))}
        </div>

        <div className="mb-4 flex items-center gap-3">
          <span
            className="block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--fg-subtle)" }}
          />
          <span className="t2k-eyebrow">
            {"// CLAUDE DESKTOP · MCP + WALLET + PAYMENTS"}
          </span>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {mpp.map((s) => (
            <StoryCard key={s.n} s={s} />
          ))}
        </div>
      </div>
    </section>
  );
}
