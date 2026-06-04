import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";
export const runtime = "edge";

export default function Icon() {
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
            d="M40.42 18.5L54.52 18.5L54.8 30.35L67.9 30.35L67.9 40.92L54.52 41.17L54.8 67.65L56.3 69.9L58.58 70.92L67.9 71.17L67.9 81.5L54.02 81.5L50.25 81L47.23 80L44.45 78.22L42.7 76.2L41.67 74.45L40.67 70.92L40.42 41.17L32.1 40.92L32.1 30.35L40.42 30.1L40.42 18.75Z"
          />
        </svg>
      </div>
    ),
    size,
  );
}
