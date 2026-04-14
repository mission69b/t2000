import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "t2000 MPP Gateway — Pay-per-request APIs on Sui";
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
          background: "#0a0a0a",
          position: "relative",
        }}
      >
        {/* Grid pattern */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
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
            background: "#3b82f6",
          }}
        />

        {/* Label */}
        <div
          style={{
            fontFamily: "monospace",
            fontSize: 12,
            color: "#3b82f6",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            marginBottom: 16,
          }}
        >
          MPP Gateway
        </div>

        {/* Title */}
        <div
          style={{
            fontFamily: "serif",
            fontSize: 52,
            color: "#ffffff",
            textAlign: "center",
            lineHeight: 1.1,
          }}
        >
          Pay-per-request APIs on Sui
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontFamily: "monospace",
            fontSize: 16,
            color: "#666666",
            marginTop: 20,
            letterSpacing: "0.03em",
          }}
        >
          No API keys. No accounts. Just USDC.
        </div>

        {/* Stats row */}
        <div
          style={{
            display: "flex",
            gap: 48,
            marginTop: 48,
          }}
        >
          {[
            { value: "40+", label: "Services" },
            { value: "88", label: "Endpoints" },
            { value: "~400ms", label: "Settlement" },
          ].map(({ value, label }) => (
            <div
              key={label}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: 28,
                  fontWeight: 700,
                  color: "#ffffff",
                }}
              >
                {value}
              </span>
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: 11,
                  color: "#555555",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                {label}
              </span>
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
          mpp.t2000.ai
        </div>
      </div>
    ),
    { ...size },
  );
}
