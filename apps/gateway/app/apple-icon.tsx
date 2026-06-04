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
          background: "#0A0A0A",
          padding: 24,
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 100 100"
          width="100%"
          height="100%"
        >
          <path
            fill="#EDEDED"
            d="M22 0H78C90.15 0 100 9.85 100 22V78C100 90.15 90.15 100 78 100H22C9.85 100 0 90.15 0 78V22C0 9.85 9.85 0 22 0Z"
          />
          <path
            fill="#0A0A0A"
            d="M43 22H57V32H65V44H57V64Q57 71 65 71V78H43V44H35V32H43Z"
          />
        </svg>
      </div>
    ),
    size,
  );
}
