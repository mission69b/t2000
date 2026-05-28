import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export const runtime = "edge";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#EDEDED",
          color: "#0A0A0A",
          fontSize: 124,
          fontWeight: 700,
          borderRadius: 40,
          fontFamily: "system-ui",
          letterSpacing: "-0.04em",
        }}
      >
        t
      </div>
    ),
    size,
  );
}
