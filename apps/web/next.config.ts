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
  // names/counts) — deleted 2026-07-06. docs.t2000.ai is the docs SSOT
  // (auto-deployed, always current); never rebuild a duplicate here.
  async redirects() {
    return [
      {
        source: "/docs",
        destination: "https://docs.t2000.ai",
        permanent: true,
      },
      // Dead-simple pass (2026-07-20): thin/duplicate pages retired.
      // identity + commerce live where the directory/console is; the verify
      // tool IS the page. (/agent-sdk redirect removed 2026-07-29 — Five
      // Layers links straight to docs.t2000.ai/agent-sdk.)
      {
        source: "/agent-id",
        destination: "https://t2000.ai",
        permanent: false,
      },
      // SPEC_HUB_V1 sweep (2026-07-10): the commerce product page was
      // retired — identity (which owns paid services now) absorbs it.
      {
        source: "/agent-commerce",
        destination: "https://t2000.ai",
        permanent: false,
      },
      // The engine product was retired (S.442); the page died in the 2026-07
      // redesign. Send old links to the SDK's successor (the wallet page).
      {
        source: "/agent-engine",
        destination: "/agent-wallet",
        permanent: true,
      },
      // Private Inference is an AUDRIC product (Program 3, SPEC_PI_TO_AUDRIC):
      // the t2000 marketing page was removed 2026-08-01 — it sold someone
      // else's product and fetched two endpoints that now 410. Old inbound
      // links land on Audric.
      {
        source: "/private-inference",
        destination: "https://audric.ai",
        permanent: false,
      },
      { source: "/api", destination: "https://audric.ai", permanent: false },
      { source: "/private-api", destination: "https://audric.ai", permanent: false },
      { source: "/usage", destination: "https://audric.ai", permanent: false },
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
