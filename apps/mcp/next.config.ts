import type { NextConfig } from "next";

// mcp.t2000.ai — the hosted Passport Connect MCP (SPEC_T2_PASSPORT_CONNECT).
// Its own Vercel project so the MCP host is independent of the store app.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
