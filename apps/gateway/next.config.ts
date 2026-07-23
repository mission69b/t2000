import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    },
  ],
  redirects: async () => [
    // Stats consolidation (2026-07-23): ONE settlement feed. The rail's
    // per-call rows are a subset of the store's activity page; the human
    // page here was a duplicate (mpp human pages are feature-frozen per
    // SPEC_T2_AGENTS_STORE). The /api/mpp/* stats + payments APIs stay —
    // the console and SDK consume them.
    {
      source: "/activity",
      destination: "https://agents.t2000.ai/activity",
      permanent: true,
    },
    {
      source: "/spec",
      destination: "https://suimpp.dev/spec",
      permanent: true,
    },
    {
      source: "/docs",
      destination: "https://suimpp.dev/docs",
      permanent: true,
    },
  ],
};

export default nextConfig;
