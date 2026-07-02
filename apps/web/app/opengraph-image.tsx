import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "t2000 — Agentic finance infrastructure on Sui";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#0072F3";

const WORDMARK = "t2000";
const EYEBROW = "// AGENTIC FINANCE · ON SUI";
const LINE_1 = "Agentic finance";
const LINE_2 = "infrastructure.";
const BOTTOM = "t2000.ai — Build agents that move money.";

async function loadGoogleFont(
  family: string,
  weight: number,
  text: string,
): Promise<ArrayBuffer> {
  const url =
    `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}` +
    `:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await (
    await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 6.1; WOW64; Trident/7.0; AS; rv:11.0) like Gecko",
      },
    })
  ).text();
  const match = css.match(
    /src:\s*url\((.+?)\)\s+format\('(opentype|truetype|woff)'\)/,
  );
  if (!match) {
    throw new Error(`Font ${family}@${weight}: font URL not found in CSS`);
  }
  const font = await fetch(match[1]);
  if (!font.ok) {
    throw new Error(`Font ${family}@${weight}: HTTP ${font.status}`);
  }
  return font.arrayBuffer();
}

export default async function Image() {
  const text = [WORDMARK, EYEBROW, LINE_1, LINE_2, BOTTOM].join(" ");
  const [sansData, monoData] = await Promise.all([
    loadGoogleFont("Geist", 600, text),
    loadGoogleFont("Geist Mono", 400, text),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#151515",
          position: "relative",
          display: "flex",
          fontFamily: "Geist",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 500px 280px at 600px 265px, rgba(0,114,245,0.20) 0%, rgba(0,114,245,0) 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle, #262626 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 16,
            top: 16,
            right: 16,
            bottom: 16,
            border: "1px solid #262626",
          }}
        />

        <div
          style={{
            position: "absolute",
            left: 80,
            top: 80,
            display: "flex",
            alignItems: "center",
            gap: 13,
          }}
        >
          <svg
            width="36"
            height="36"
            viewBox="0 0 100 100"
            style={{ display: "block" }}
          >
            <path
              fill="#EDEDED"
              d="M22 0H78C90.15 0 100 9.85 100 22V78C100 90.15 90.15 100 78 100H22C9.85 100 0 90.15 0 78V22C0 9.85 9.85 0 22 0Z"
            />
            <path
              fill="#151515"
              d="M40.42 18.5L54.52 18.5L54.8 30.35L67.9 30.35L67.9 40.92L54.52 41.17L54.8 67.65L56.3 69.9L58.58 70.92L67.9 71.17L67.9 81.5L54.02 81.5L50.25 81L47.23 80L44.45 78.22L42.7 76.2L41.67 74.45L40.67 70.92L40.42 41.17L32.1 40.92L32.1 30.35L40.42 30.1L40.42 18.75Z"
            />
          </svg>
          <div
            style={{
              display: "flex",
              fontFamily: "Geist",
              fontWeight: 600,
              fontSize: 28,
              color: "#ffffff",
              letterSpacing: "-0.6px",
            }}
          >
            {WORDMARK}
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            left: 80,
            top: 280,
            display: "flex",
            fontFamily: "Geist Mono",
            fontSize: 14,
            color: "#999999",
            letterSpacing: "0.10em",
          }}
        >
          {EYEBROW}
        </div>

        <div
          style={{
            position: "absolute",
            left: 80,
            top: 340,
            display: "flex",
            flexDirection: "column",
            fontFamily: "Geist",
            fontWeight: 600,
            fontSize: 68,
            lineHeight: 1.05,
            letterSpacing: "-2.2px",
          }}
        >
          <div style={{ display: "flex", color: "#ffffff" }}>{LINE_1}</div>
          <div style={{ display: "flex", color: ACCENT }}>{LINE_2}</div>
        </div>

        <div
          style={{
            position: "absolute",
            left: 80,
            top: 560,
            display: "flex",
            fontFamily: "Geist Mono",
            fontSize: 16,
            color: "#666666",
          }}
        >
          {BOTTOM}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Geist", data: sansData, weight: 600, style: "normal" },
        { name: "Geist Mono", data: monoData, weight: 400, style: "normal" },
      ],
    },
  );
}
