import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatDate, getAllPosts, getPost } from "@/lib/blog";
import { Nav } from "../../components/site/Nav";
import { SiteFooter } from "../../components/site/SiteFooter";

export function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) {
    return {};
  }
  return { title: `${post.title} — t2000`, description: post.description };
}

export default async function BlogPost({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) {
    notFound();
  }
  return (
    <>
      <Nav />
      <main
        className="t2k-container"
        style={{ paddingTop: 56, paddingBottom: 96, maxWidth: 720 }}
      >
        <Link
          className="inline-block font-mono text-[12px] no-underline"
          href="/blog"
          style={{ color: "var(--fg-subtle)" }}
        >
          ← Blog
        </Link>
        <div
          className="mt-8 font-mono text-[12px]"
          style={{ color: "var(--fg-subtle)" }}
        >
          {formatDate(post.date)}
        </div>
        <h1
          className="mt-2 tracking-tight text-foreground"
          style={{
            fontSize: 36,
            fontWeight: 600,
            letterSpacing: "-0.035em",
            lineHeight: 1.1,
          }}
        >
          {post.title}
        </h1>
        <div className="blog-prose" style={{ marginTop: 32 }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {post.content}
          </ReactMarkdown>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
