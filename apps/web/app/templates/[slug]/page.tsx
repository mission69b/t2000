import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "../../components/ui/CopyButton";
import { Nav } from "../../components/site/Nav";
import { SiteFooter } from "../../components/site/SiteFooter";
import { TemplatePreview } from "../../components/templates/TemplatePreview";
import { DEVELOPERS_URL } from "../../data/t2k";
import { getTemplate, scaffoldCmd, TEMPLATES } from "../../data/templates";

// Vercel template-detail shape: name + one line + actions up top, big
// preview, then the words (about / what's included / commands) below.

export function generateStaticParams() {
  return TEMPLATES.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const t = getTemplate((await params).slug);
  if (!t) return {};
  return {
    title: `${t.name} — Templates — t2000`,
    description: t.oneLiner,
    openGraph: {
      title: `${t.name} — t2000 Templates`,
      description: t.oneLiner,
      url: `https://t2000.ai/templates/${t.slug}`,
      type: "website",
    },
  };
}

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const t = getTemplate((await params).slug);
  if (!t) notFound();
  const cmd = scaffoldCmd(t.slug);

  return (
    <>
      <Nav />
      <main>
        <section style={{ padding: "56px 0 80px" }}>
          <div className="t2k-container" style={{ maxWidth: 880 }}>
            <Link
              className="font-mono text-[11.5px] no-underline transition-colors hover:text-foreground"
              href="/templates"
              style={{ color: "var(--fg-subtle)" }}
            >
              ← Templates
            </Link>

            <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1
                  className="t2k-display"
                  style={{ fontSize: "clamp(28px, 3.6vw, 40px)", color: "var(--fg)" }}
                >
                  {t.name}
                </h1>
                <p
                  className="m-0 mt-2 max-w-[520px] text-[15px] leading-relaxed"
                  style={{ color: "var(--fg-muted)" }}
                >
                  {t.oneLiner}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-2">
                {t.stack.map((s) => (
                  <span
                    className="rounded-full border px-2.5 py-1 font-mono text-[10.5px]"
                    key={s}
                    style={{
                      borderColor: "var(--ds-gray-alpha-300)",
                      color: "var(--fg-muted)",
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-8" style={{ height: 340 }}>
              <TemplatePreview slug={t.slug} />
            </div>

            <div
              className="mt-8 flex items-center gap-3 rounded-lg border py-3 pr-3 pl-4"
              style={{
                background: "var(--ds-gray-alpha-100)",
                borderColor: "var(--ds-gray-alpha-300)",
              }}
            >
              <code
                className="min-w-0 flex-1 truncate font-mono text-[13px]"
                style={{ color: "var(--fg)" }}
              >
                <span style={{ color: "var(--fg-subtle)" }}>$ </span>
                {cmd}
              </code>
              <CopyButton payload={cmd} />
            </div>
            <p
              className="m-0 mt-2.5 font-mono text-[11.5px]"
              style={{ color: "var(--fg-subtle)" }}
            >
              then: npm install · export T2000_API_KEY=sk-... ·{" "}
              <span style={{ color: "var(--fg-muted)" }}>{t.firstRun}</span>
              {" — free key: "}
              <a
                className="underline underline-offset-4 transition-colors hover:text-foreground"
                href="https://agents.t2000.ai/manage"
                rel="noreferrer"
                style={{ color: "var(--fg-subtle)" }}
                target="_blank"
              >
                agents.t2000.ai
              </a>
            </p>

            <div className="mt-12 grid gap-10 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <div>
                <div className="t2k-eyebrow mb-3">ABOUT</div>
                <p
                  className="m-0 text-[14px] leading-[1.65]"
                  style={{ color: "var(--fg-muted)" }}
                >
                  {t.about}
                </p>
                {t.extra && (
                  <div className="mt-6">
                    <div className="t2k-eyebrow mb-3">GOES WELL WITH</div>
                    <div
                      className="flex items-center gap-3 rounded-lg border py-2.5 pr-2.5 pl-4"
                      style={{ borderColor: "var(--ds-gray-alpha-300)" }}
                    >
                      <code
                        className="min-w-0 flex-1 truncate font-mono text-[12px]"
                        style={{ color: "var(--fg)" }}
                      >
                        {t.extra.cmd}
                      </code>
                      <CopyButton payload={t.extra.cmd} variant="outlined" />
                    </div>
                    <p
                      className="m-0 mt-2 text-[12px]"
                      style={{ color: "var(--fg-subtle)" }}
                    >
                      {t.extra.label}
                    </p>
                  </div>
                )}
              </div>
              <div>
                <div className="t2k-eyebrow mb-3">WHAT&rsquo;S INCLUDED</div>
                <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                  {t.included.map((item) => (
                    <li
                      className="flex gap-2.5 text-[13px] leading-relaxed"
                      key={item}
                      style={{ color: "var(--fg-muted)" }}
                    >
                      <span aria-hidden="true" style={{ color: "var(--t2k-accent)" }}>
                        —
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
                <p className="m-0 mt-5 text-[12.5px]" style={{ color: "var(--fg-subtle)" }}>
                  Full options:{" "}
                  <a
                    className="underline underline-offset-4 transition-colors hover:text-foreground"
                    href={`${DEVELOPERS_URL}/create-t2-app`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    create-t2-app docs
                  </a>
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
