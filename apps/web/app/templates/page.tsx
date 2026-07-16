import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton } from "../components/ui/CopyButton";
import { Nav } from "../components/site/Nav";
import { SiteFooter } from "../components/site/SiteFooter";
import { TemplatePreview } from "../components/templates/TemplatePreview";
import { CREATE_CMD, TEMPLATES } from "../data/templates";

const DESC =
  "Jumpstart a router-wired agent project. One command, private by default — an AI chat app, an agent worker, and a Sui dApp.";

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

// The Vercel-gallery shape (founder direction 2026-07-16): visual card +
// one line here; the words live on /templates/[slug]. Every template is
// scaffolded by `npm create t2-app@latest` and bills t2000/auto on first run.
export default function TemplatesPage() {
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
              Find your template.
            </h1>
            <p
              className="m-0 max-w-[560px]"
              style={{
                marginTop: 16,
                fontSize: 16,
                lineHeight: 1.55,
                color: "var(--fg-muted)",
                letterSpacing: "-0.011em",
              }}
            >
              Jumpstart an agent project with a pre-built starter. One command,
              private by default.
            </p>

            <div
              className="mt-7 inline-flex max-w-full items-center gap-3 rounded-lg border py-2.5 pr-2.5 pl-4"
              style={{
                background: "var(--ds-gray-alpha-100)",
                borderColor: "var(--ds-gray-alpha-300)",
              }}
            >
              <code
                className="min-w-0 truncate font-mono text-[13.5px]"
                style={{ color: "var(--fg)" }}
              >
                <span style={{ color: "var(--fg-subtle)" }}>$ </span>
                {CREATE_CMD}
              </code>
              <CopyButton payload={CREATE_CMD} />
            </div>

            <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {TEMPLATES.map((t) => (
                <Link
                  className="t2k-card t2k-card-hover group flex flex-col no-underline"
                  href={`/templates/${t.slug}`}
                  key={t.slug}
                >
                  <div className="p-5 pb-4">
                    <div
                      className="text-[17px] font-semibold"
                      style={{ color: "var(--fg)", letterSpacing: "-0.02em" }}
                    >
                      {t.name}
                    </div>
                    <p
                      className="m-0 mt-1.5 text-[13px] leading-relaxed"
                      style={{ color: "var(--fg-muted)" }}
                    >
                      {t.oneLiner}
                    </p>
                  </div>
                  <div className="mt-auto px-5 pb-5" style={{ height: 218 }}>
                    <TemplatePreview slug={t.slug} />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
