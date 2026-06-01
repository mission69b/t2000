import { DEVELOPERS_URL } from "../../data/t2k";

export function RecipesCta() {
  return (
    <a
      href={`${DEVELOPERS_URL}/recipes/morning-brief`}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed px-[18px] py-3.5 no-underline transition-colors hover:border-accent hover:bg-accent/[0.08]"
      style={{ borderColor: "var(--ds-gray-alpha-400)", color: "var(--fg)" }}
    >
      <span
        className="font-mono text-[13px]"
        style={{ color: "var(--fg-muted)" }}
      >
        <span style={{ color: "var(--fg)" }}>Every recipe</span> · full how-to +
        runnable SDK code
      </span>
      <span
        className="whitespace-nowrap text-[13.5px] font-medium"
        style={{ letterSpacing: "-0.011em", color: "var(--t2k-accent)" }}
      >
        Browse all recipes →
      </span>
    </a>
  );
}
