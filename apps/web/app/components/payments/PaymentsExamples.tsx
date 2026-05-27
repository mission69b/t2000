import { T2K_STORIES } from "../../data/t2k";
import { StoryCard } from "../home/StoryCard";

export function PaymentsExamples() {
  const mpp = T2K_STORIES.filter((s) => s.tag.startsWith("MPP"));

  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <header className="mb-12 max-w-[720px]">
          <span className="t2k-eyebrow">{"// COMMON PATTERNS"}</span>
          <h2 className="t2k-section-title mt-3">
            What your agent builds
            <br />
            <span style={{ color: "var(--fg-muted)" }}>with the catalog.</span>
          </h2>
          <p className="t2k-section-sub">
            Each prompt is a real chain of MPP calls. Copy any, paste into
            Claude Desktop.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {mpp.map((s) => (
            <StoryCard key={s.n} s={s} />
          ))}
        </div>
      </div>
    </section>
  );
}
