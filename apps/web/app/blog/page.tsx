import type { Metadata } from "next";
import Link from "next/link";
import { formatDate, getAllPosts } from "@/lib/blog";
import { Nav } from "../components/site/Nav";
import { SiteFooter } from "../components/site/SiteFooter";

export const metadata: Metadata = {
  title: "Blog — t2000",
  description:
    "Product and engineering notes from t2000 — the agent stack on Sui.",
};

export const revalidate = 60;

export default function BlogIndex() {
  const posts = getAllPosts();
  return (
    <>
      <Nav />
      <main
        className="t2k-container"
        style={{ paddingTop: 64, paddingBottom: 96, maxWidth: 760 }}
      >
        <h1
          className="tracking-tight text-foreground"
          style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.035em" }}
        >
          Blog
        </h1>
        <p className="mt-3 text-[16px]" style={{ color: "var(--fg-muted)" }}>
          Product and engineering notes from the t2000 stack.
        </p>

        <div className="mt-10">
          {posts.map((p) => (
            <Link
              className="group block no-underline"
              href={`/blog/${p.slug}`}
              key={p.slug}
              style={{
                padding: "22px 0",
                borderTop: "1px solid var(--ds-gray-alpha-300)",
              }}
            >
              <div
                className="font-mono text-[12px]"
                style={{ color: "var(--fg-subtle)" }}
              >
                {formatDate(p.date)}
              </div>
              <div className="mt-1.5 text-[19px] font-medium tracking-tight text-foreground">
                {p.title}
              </div>
              <div className="mt-1 text-[14px]" style={{ color: "var(--fg-muted)" }}>
                {p.description}
              </div>
            </Link>
          ))}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
