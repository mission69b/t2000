import type { Metadata } from "next";
import { Nav } from "../components/site/Nav";
import { SiteFooter } from "../components/site/SiteFooter";
import { TemplatesGallery } from "../components/templates/TemplatesGallery";

const DESC =
  "Ready-to-use build prompts — sites, apps, agents, components. Copy a prompt, paste it into t2 code, and launch.";

export const metadata: Metadata = {
  title: "Templates — t2000",
  description: DESC,
  openGraph: {
    title: "Templates — t2000",
    description: DESC,
    url: "https://t2000.ai/templates",
    type: "website",
  },
};

// Prompt-first templates gallery (motionsites layout, founder direction
// 2026-07-19). The prompt IS the template: every card carries a complete
// build spec, the Copy button is the primary action, t2 code is the target.
export default function TemplatesPage() {
  return (
    <>
      <Nav />
      <main>
        <section style={{ padding: "76px 0 88px" }}>
          <div className="t2k-container">
            <div className="flex flex-col items-center text-center">
              <span
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em]"
                style={{
                  borderColor: "var(--ds-gray-alpha-400)",
                  color: "var(--fg-subtle)",
                }}
              >
                Templates
              </span>
              <h1
                className="t2k-display mt-5"
                style={{ fontSize: "clamp(38px, 5.4vw, 64px)", color: "var(--fg)" }}
              >
                Prompt-first development.
              </h1>
              <p
                className="m-0 max-w-[540px]"
                style={{
                  marginTop: 16,
                  fontSize: 16,
                  lineHeight: 1.55,
                  color: "var(--fg-muted)",
                  letterSpacing: "-0.011em",
                }}
              >
                Every template is a complete, ready-to-use build prompt. Copy it,
                paste it into <span style={{ color: "var(--fg)" }}>t2 code</span>,
                and launch.
              </p>
            </div>
            <TemplatesGallery />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
