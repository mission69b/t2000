import type { Metadata } from "next";
import { Nav } from "../components/site/Nav";
import { SiteFooter } from "../components/site/SiteFooter";
import { PlaygroundGallery } from "../components/playground/PlaygroundGallery";

const DESC =
  "Prompt-first development. Copy a full build prompt — a site, an app, an agent, a component — and paste it into t2 code or any coding agent on t2000/auto.";

export const metadata: Metadata = {
  title: "Playground — t2000",
  description: DESC,
  openGraph: {
    title: "Playground — t2000",
    description: DESC,
    url: "https://t2000.ai/playground",
    type: "website",
  },
};

// Prompt-first gallery (replaces /templates, founder direction 2026-07-19).
// The prompt IS the product: every card carries a complete build spec, the
// copy button is the primary action, and t2 code is the suggested target.
export default function PlaygroundPage() {
  return (
    <>
      <Nav />
      <main>
        <section style={{ padding: "72px 0 80px" }}>
          <div className="t2k-container">
            <h1
              className="t2k-display"
              style={{ fontSize: "clamp(34px, 4.6vw, 52px)", color: "var(--fg)" }}
            >
              Copy a prompt. Ship the thing.
            </h1>
            <p
              className="m-0 max-w-[600px]"
              style={{
                marginTop: 16,
                fontSize: 16,
                lineHeight: 1.55,
                color: "var(--fg-muted)",
                letterSpacing: "-0.011em",
              }}
            >
              Every card below is a complete build prompt — sites, apps, agents,
              components. Copy it, paste it into{" "}
              <span style={{ color: "var(--fg)" }}>t2 code</span> (or any coding
              agent on t2000/auto), and it builds. No boilerplate to clone, no
              docs to read first.
            </p>
            <PlaygroundGallery />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
