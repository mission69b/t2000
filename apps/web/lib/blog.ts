import fs from "node:fs";
import path from "node:path";

export type BlogPost = {
  slug: string;
  title: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  description: string;
  author?: string;
  /** Markdown body (frontmatter stripped). */
  content: string;
};

const BLOG_DIR = path.join(process.cwd(), "content/blog");

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

function parseFrontmatter(raw: string): {
  data: Record<string, string>;
  body: string;
} {
  const m = raw.match(FRONTMATTER);
  if (!m) {
    return { data: {}, body: raw };
  }
  const data: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) {
      continue;
    }
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    data[key] = val;
  }
  return { data, body: m[2] };
}

function toPost(filename: string): BlogPost | null {
  const raw = fs.readFileSync(path.join(BLOG_DIR, filename), "utf8");
  const { data, body } = parseFrontmatter(raw);
  // `draft: true` hides a post from the index + routes. (Scheduling = flip the
  // flag per post when you want it live; a date-based auto-gate needs request-
  // time `new Date()`, which Next 16's static prerender / Cache Components
  // disallows — not worth making the whole blog dynamic for a drip.)
  if (data.draft === "true") {
    return null;
  }
  const slug = filename.replace(/\.md$/, "");
  return {
    slug,
    title: data.title ?? slug,
    date: data.date ?? "",
    description: data.description ?? "",
    author: data.author,
    content: body.trim(),
  };
}

/** All published posts, newest first. */
export function getAllPosts(): BlogPost[] {
  if (!fs.existsSync(BLOG_DIR)) {
    return [];
  }
  return fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".md"))
    .map(toPost)
    .filter((p): p is BlogPost => p !== null)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getPost(slug: string): BlogPost | null {
  const file = path.join(BLOG_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) {
    return null;
  }
  return toPost(`${slug}.md`);
}

export function formatDate(iso: string): string {
  if (!iso) {
    return "";
  }
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
}
