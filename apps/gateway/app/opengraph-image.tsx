import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "mpp.t2000.ai — Pay-per-request APIs on Sui. Gasless.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#0AC7B4";

const WORDMARK = "mpp";
const PILL = "GATEWAY LIVE · SUI MAINNET";
const EYEBROW = "// AGENT PAYMENTS · ON SUI";
const LINE_1 = "Pay-per-request APIs";
const LINE_2 = "on Sui. Gasless.";
const BOTTOM = "mpp.t2000.ai — Pay any API in USDC.";

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
  const text = [WORDMARK, PILL, EYEBROW, LINE_1, LINE_2, BOTTOM].join(" ");
  const [sansData, monoData400, monoData500] = await Promise.all([
    loadGoogleFont("Geist", 600, text),
    loadGoogleFont("Geist Mono", 400, text),
    loadGoogleFont("Geist Mono", 500, text),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0A0A0A",
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
              "radial-gradient(ellipse 500px 280px at 600px 265px, rgba(10,199,180,0.20) 0%, rgba(10,199,180,0) 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
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
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        />

        <div
          style={{
            position: "absolute",
            left: 80,
            top: 80,
            display: "flex",
            alignItems: "center",
            gap: 11,
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 100 100"
            style={{ display: "block" }}
          >
            <path
              fill="#EDEDED"
              d="M22 0H78C90.15 0 100 9.85 100 22V78C100 90.15 90.15 100 78 100H22C9.85 100 0 90.15 0 78V22C0 9.85 9.85 0 22 0Z"
            />
            <path
              fill="#0A0A0A"
              d="M39 24H53V36H64V49H53V65Q53 72 64 72V78H39V49H28V36H39Z"
            />
          </svg>
          <div
            style={{
              display: "flex",
              fontFamily: "Geist Mono",
              fontWeight: 500,
              fontSize: 22,
              color: "#ffffff",
              letterSpacing: "0.5px",
            }}
          >
            {WORDMARK}
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            left: 80,
            top: 235,
            display: "flex",
            alignItems: "center",
            gap: 8,
            height: 28,
            paddingLeft: 12,
            paddingRight: 14,
            borderRadius: 14,
            background: "rgba(10,199,180,0.10)",
            border: "1px solid rgba(10,199,180,0.30)",
          }}
        >
          <div
            style={{
              width: 4,
              height: 4,
              borderRadius: 2,
              background: ACCENT,
              display: "flex",
            }}
          />
          <div
            style={{
              display: "flex",
              fontFamily: "Geist Mono",
              fontSize: 11,
              fontWeight: 500,
              color: ACCENT,
              letterSpacing: "1.5px",
            }}
          >
            {PILL}
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
        { name: "Geist Mono", data: monoData400, weight: 400, style: "normal" },
        { name: "Geist Mono", data: monoData500, weight: 500, style: "normal" },
      ],
    },
  );
}
