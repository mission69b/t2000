import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @t2000/sdk `verifyReceipt` dynamically imports @phala/dcap-qvl (CJS + WASM).
  // Keep it external so Next doesn't bundle the WASM (the verify route runs it
  // server-side, and with skipQuote it isn't reached anyway).
  serverExternalPackages: ["@phala/dcap-qvl"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
