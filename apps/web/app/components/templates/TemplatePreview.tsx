// Pure-CSS template preview art (no screenshots needed — the designer can
// swap real captures in later). One mock per template slug, rendered inside
// a browser/terminal chrome frame, Vercel-gallery style.

const FRAME_BG = "#0b0c0d";
const CHROME_BG = "#111214";

function FrameDots() {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <span
          className="rounded-full"
          key={i}
          style={{ width: 8, height: 8, background: "var(--ds-gray-alpha-400)" }}
        />
      ))}
    </div>
  );
}

function Frame({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <div
      aria-hidden="true"
      className="flex h-full w-full flex-col overflow-hidden rounded-lg border"
      style={{ background: FRAME_BG, borderColor: "var(--ds-gray-alpha-300)" }}
    >
      <div
        className="flex items-center gap-3 border-b px-3.5"
        style={{
          height: 30,
          background: CHROME_BG,
          borderBottomColor: "var(--ds-gray-alpha-200)",
        }}
      >
        <FrameDots />
        <span className="font-mono text-[9.5px]" style={{ color: "var(--fg-subtle)" }}>
          {title}
        </span>
      </div>
      <div className="relative flex-1 overflow-hidden p-4">{children}</div>
    </div>
  );
}

function ChatPreview() {
  return (
    <Frame title="localhost:3000">
      <div className="flex h-full flex-col gap-2.5">
        <div
          className="ml-auto max-w-[62%] rounded-lg rounded-br-sm px-3 py-1.5 text-[10px]"
          style={{ background: "var(--t2k-accent)", color: "#fff" }}
        >
          Summarize this repo for me
        </div>
        <div
          className="max-w-[74%] rounded-lg rounded-bl-sm border px-3 py-1.5 text-[10px] leading-relaxed"
          style={{
            background: CHROME_BG,
            borderColor: "var(--ds-gray-alpha-300)",
            color: "var(--fg-muted)",
          }}
        >
          A Next.js app with a hand-written SSE relay — two files of wiring,
          no SDK…
          <span
            className="mt-1.5 block font-mono text-[8.5px]"
            style={{ color: "var(--fg-subtle)" }}
          >
            served by t2000/auto
          </span>
        </div>
        <div
          className="mt-auto flex items-center justify-between rounded-md border px-3 py-2"
          style={{ background: CHROME_BG, borderColor: "var(--ds-gray-alpha-300)" }}
        >
          <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>
            Ask anything…
          </span>
          <span
            className="flex items-center justify-center rounded"
            style={{ width: 16, height: 16, background: "var(--t2k-accent)" }}
          >
            <svg fill="none" height="9" viewBox="0 0 10 10" width="9">
              <path
                d="M5 8V2M2.5 4.5L5 2l2.5 2.5"
                stroke="#fff"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.3"
              />
            </svg>
          </span>
        </div>
      </div>
    </Frame>
  );
}

function WorkerPreview() {
  return (
    <Frame title="~/my-app — npm start">
      <div className="flex h-full flex-col gap-1.5 font-mono text-[10px] leading-relaxed">
        <div style={{ color: "var(--fg-subtle)" }}>
          <span style={{ color: "var(--t2k-success)" }}>$</span> npm start
        </div>
        <div style={{ color: "var(--fg-muted)" }}>
          I am a concise, AI-driven assistant designed to
        </div>
        <div style={{ color: "var(--fg-muted)" }}>
          provide efficient and direct answers…
          <span
            className="ml-1 inline-block"
            style={{
              width: 6,
              height: 11,
              background: "var(--fg-muted)",
              verticalAlign: "-2px",
            }}
          />
        </div>
        <div className="mt-auto" style={{ color: "var(--fg-subtle)" }}>
          served by <span style={{ color: "var(--t2k-accent)" }}>zai/glm-5.2</span>{" "}
          (bulk)
        </div>
      </div>
    </Frame>
  );
}

function SuiPreview() {
  return (
    <Frame title="localhost:3000">
      <div className="flex h-full flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px]" style={{ color: "var(--fg-subtle)" }}>
            0x7ce4…a1f2
          </span>
          <span
            className="rounded-full border px-2 py-0.5 text-[8.5px] font-medium"
            style={{
              borderColor: "var(--t2k-success)",
              color: "var(--t2k-success)",
            }}
          >
            Connected
          </span>
        </div>
        {[
          ["SUI", "0.1034"],
          ["USDC", "12.50"],
        ].map(([sym, amt]) => (
          <div
            className="flex items-center justify-between rounded-md border px-3 py-1.5"
            key={sym}
            style={{ background: CHROME_BG, borderColor: "var(--ds-gray-alpha-300)" }}
          >
            <span className="text-[10px] font-medium" style={{ color: "var(--fg)" }}>
              {sym}
            </span>
            <span className="font-mono text-[10px]" style={{ color: "var(--fg-muted)" }}>
              {amt}
            </span>
          </div>
        ))}
        <div
          className="mt-auto rounded-lg rounded-bl-sm border px-3 py-1.5 text-[9.5px] leading-relaxed"
          style={{
            background: CHROME_BG,
            borderColor: "var(--ds-gray-alpha-300)",
            color: "var(--fg-muted)",
          }}
        >
          You&rsquo;re holding 0.103 SUI and 12.50 USDC…
        </div>
      </div>
    </Frame>
  );
}

export function TemplatePreview({ slug }: { slug: string }) {
  if (slug === "chat") return <ChatPreview />;
  if (slug === "agent-worker") return <WorkerPreview />;
  return <SuiPreview />;
}
