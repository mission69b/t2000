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
