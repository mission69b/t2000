import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "t2000 — The Infrastructure Behind Audric";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#000000",
          position: "relative",
        }}
      >
        {/* Grid pattern overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        {/* Accent line */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: "linear-gradient(90deg, #10b981, #3b82f6, #8b5cf6)",
          }}
        />

        {/* Brand */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 12,
          }}
        >
          <span
            style={{
              fontFamily: "monospace",
              fontSize: 72,
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "-2px",
            }}
          >
            t2000
          </span>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontFamily: "monospace",
            fontSize: 20,
            color: "#666666",
            marginTop: 20,
            letterSpacing: "0.05em",
          }}
        >
          The Infrastructure Behind Audric
        </div>

        {/* Feature chips */}
        <div
          style={{
            display: "flex",
            gap: 16,
            marginTop: 40,
          }}
        >
          {["CLI", "SDK", "MCP", "Engine", "Gateway"].map((label) => (
            <div
              key={label}
              style={{
                fontFamily: "monospace",
                fontSize: 13,
                color: "#999999",
                border: "1px solid #333333",
                borderRadius: 6,
                padding: "6px 14px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* URL */}
        <div
          style={{
            position: "absolute",
            bottom: 32,
            fontFamily: "monospace",
            fontSize: 13,
            color: "#444444",
            letterSpacing: "0.06em",
          }}
        >
          t2000.ai
        </div>
      </div>
    ),
    { ...size },
  );
}
