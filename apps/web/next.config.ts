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
    "/.well-known/agent-skills/index.json": ["../../t2000-skills/skills/**/SKILL.md"],
    "/AGENTS.md": ["../../t2000-skills/AGENTS.md"],
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
