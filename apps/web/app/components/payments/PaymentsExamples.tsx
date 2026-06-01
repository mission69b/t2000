import { T2K_STORIES } from "../../data/t2k";
import { RecipesCta } from "../site/RecipesCta";
import { StoryCard } from "../home/StoryCard";

export function PaymentsExamples() {
  const mpp = T2K_STORIES.filter((s) => s.tag.startsWith("MPP"));

  return (
    <section className="t2k-section">
      <div className="t2k-container">
        <header className="mb-12 max-w-[720px]">
          <span className="t2k-eyebrow">{"// COMMON PATTERNS"}</span>
          <h2 className="t2k-section-title mt-[22px]">
            What your agent builds.
          </h2>
          <p className="t2k-section-sub">
            Real chained prompts. Copy any, paste into Claude Desktop.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {mpp.map((s) => (
            <StoryCard key={s.n} s={s} />
          ))}
        </div>

        <RecipesCta />
      </div>
    </section>
  );
}
