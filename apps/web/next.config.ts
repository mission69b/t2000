import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // [SPEC_AGENTIC_STACK Phase 3 — 2026-05-25]
  // Pull `t2000-skills/skills/**/SKILL.md` into the Vercel function bundle
  // so the `/skills/[slug]` and `/.well-known/agent-skills/index.json`
  // routes can read them at runtime. The repo monorepo layout is:
  //
  //   t2000/
  //     apps/web/             ← Next.js project root (this file)
  //     t2000-skills/skills/  ← canonical SKILL.md source
  //
  // Paths in the include globs are relative to this `next.config.ts`.
  // Glob keys use picomatch syntax — `[slug]` is read as a character class,
  // not a literal, so we use `/skills/*` to match the dynamic segment.
  outputFileTracingIncludes: {
    "/skills/*": ["../../t2000-skills/skills/**/SKILL.md"],
    "/skills/feed.json": ["../../t2000-skills/feed.json"],
    "/skills/brand/*": ["../../t2000-skills/brand/*"],
    "/.well-known/agent-skills/index.json": ["../../t2000-skills/skills/**/SKILL.md"],
    "/AGENTS.md": ["../../t2000-skills/AGENTS.md"],
  },
  // The hand-rolled /docs hub drifted badly (retired engine card, wrong tool
  // names/counts) — deleted 2026-07-06. developers.t2000.ai is the docs SSOT
  // (auto-deployed, always current); never rebuild a duplicate here.
  async redirects() {
    return [
      {
        source: "/docs",
        destination: "https://developers.t2000.ai",
        permanent: true,
      },
      // SPEC_HUB_V1 sweep (2026-07-10): the commerce product page was
      // retired — identity (which owns paid services now) absorbs it.
      {
        source: "/agent-commerce",
        destination: "/agent-id",
        permanent: false,
      },
      // The engine product was retired (S.442); the page died in the 2026-07
      // redesign. Send old links to the SDK (its closest living successor).
      {
        source: "/agent-engine",
        destination: "/agent-sdk",
        permanent: true,
      },
      // Product page moved 2026-07-06 — /api reads like an API root and the
      // app/api segment is conventionally route handlers, not a page.
      {
        source: "/api",
        destination: "/private-inference",
        permanent: true,
      },
      // Slug matched to the product name (2026-07-14): the page sells
      // Private Inference, so the URL says so.
      {
        source: "/private-api",
        destination: "/private-inference",
        permanent: true,
      },
      // Templates went prompt-first (2026-07-19) — the per-slug detail pages
      // folded into the gallery modal.
      {
        source: "/templates/:slug",
        destination: "/templates",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
