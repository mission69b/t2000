"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type MsgStep =
  | { type: "user"; text: string }
  | { type: "think"; ms?: number }
  | { type: "ai"; tools?: string[]; html: string; err?: boolean; hold?: number };

type Scene =
  | { kind: "card"; text: string; sub?: string; hold?: number }
  | { kind: "chat"; messages: MsgStep[]; hold?: number };

const scenes: Scene[] = [
  { kind: "card", text: "Your agent has a\nbank account.", hold: 3200 },
  {
    kind: "chat",
    messages: [
      { type: "user", text: "What\u2019s my financial health looking like?" },
      { type: "think", ms: 1200 },
      {
        type: "ai",
        tools: ["t2000_balance", "t2000_rates"],
        html: `<table><tr><td>Checking</td><td class="hi">$96.81 USDC</td><td class="nt">spendable</td></tr><tr><td>Savings</td><td>$5.10</td><td class="nt">4.98% APY</td></tr><tr><td>Credit</td><td>$0.00</td><td class="nt">no active loans</td></tr><tr><td>Investment</td><td class="hi">$521.04</td><td class="nt">SUI \u00b7 BTC \u00b7 ETH \u00b7 GOLD</td></tr><tr><td>Gas</td><td>0.86 SUI</td><td class="nt">~$0.84</td></tr><tr class="bdr"><td><strong>Total</strong></td><td class="hi"><strong>$102.75</strong></td><td></td></tr></table><div class="nt">93% of your funds are idle in checking earning nothing.</div>`,
        hold: 2500,
      },
    ],
  },
  { kind: "card", text: "It earns yield\nwhile you sleep.", hold: 2500 },
  {
    kind: "chat",
    messages: [
      { type: "user", text: "Move my idle USDC to the highest yield" },
      { type: "think", ms: 1000 },
      {
        type: "ai",
        tools: ["t2000_rates", "t2000_save"],
        html: `<table><tr><td>Deposited</td><td class="hi">$95.81 USDC \u2192 savings</td></tr><tr><td>Protocol</td><td>NAVI \u00b7 4.98% APY</td></tr><tr><td>Projected</td><td class="hi">~$4.77 / year</td></tr><tr><td>Tx</td><td class="tx">suiscan.xyz/tx/Ae7q\u2026</td></tr></table>`,
        hold: 1200,
      },
      { type: "user", text: "Rebalance to maximize APY" },
      { type: "think", ms: 1200 },
      {
        type: "ai",
        tools: ["t2000_rebalance"],
        html: `<table><tr><td>Before</td><td>USDC \u00b7 4.98% APY \u00b7 ~$4.77/yr</td></tr><tr><td>After</td><td class="hi">USDT \u00b7 5.55% APY \u00b7 ~$5.32/yr \u2191</td></tr><tr><td>Extra yield</td><td class="hi">+$0.55/yr \u00b7 break-even 6 days</td></tr><tr><td>Tx</td><td class="tx">suiscan.xyz/tx/Rw3n\u2026</td></tr></table>`,
        hold: 2000,
      },
    ],
  },
  { kind: "card", text: "Borrows when\nit needs to.", hold: 2500 },
  {
    kind: "chat",
    messages: [
      { type: "user", text: "Send $50 to Tom \u2014 borrow if I\u2019m short" },
      { type: "think", ms: 1400 },
      {
        type: "ai",
        tools: ["t2000_balance", "t2000_health", "t2000_borrow", "t2000_send"],
        html: `<div class="nt" style="margin:0 0 8px">Checking is $1.00. Borrowing $50 against savings collateral.</div><table><tr><td>Resolved</td><td>Tom \u2192 0x8b3e\u2026f4a2</td></tr><tr><td>Borrowed</td><td class="hi">$50.00 USDC from NAVI</td></tr><tr><td>Collateral</td><td>$95.81 USDT \u00b7 health: 1.8</td></tr><tr><td>Sent</td><td class="hi">$50.00 \u2192 0x8b3e\u2026f4a2</td></tr><tr><td>Tx</td><td class="tx">suiscan.xyz/tx/Hk9m\u2026</td></tr></table><div class="nt">Borrowed and sent in one step. Savings keep earning as collateral.</div>`,
        hold: 2800,
      },
    ],
  },
  { kind: "card", text: "Protected by limits\nyou control.", hold: 2500 },
  {
    kind: "chat",
    messages: [
      { type: "user", text: "Send $200 to Phil" },
      { type: "think", ms: 800 },
      {
        type: "ai",
        tools: ["\u2715 t2000_send"],
        err: true,
        html: `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span class="red" style="font-size:15px">\u2715</span><span class="red" style="font-size:12px">Transaction blocked</span></div><table><tr><td>Requested</td><td class="red">$200.00 \u2192 0x7c4f\u2026d1b3</td></tr><tr><td>Per-tx limit</td><td>$100.00</td></tr></table><div class="nt">Safeguard limit exceeded.</div>`,
        hold: 1500,
      },
      { type: "user", text: "Lock my agent" },
      { type: "think", ms: 600 },
      {
        type: "ai",
        tools: ["t2000_lock"],
        html: `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="font-size:15px">\ud83d\udd12</span><span style="font-weight:600;font-size:12px">Agent locked</span></div><div class="nt">All operations frozen. Run <span style="color:var(--cw-fg)">t2000 unlock</span> to resume.</div>`,
        hold: 2000,
      },
    ],
  },
  {
    kind: "card",
    text: "Pays for intelligence\nautonomously.",
    sub: "x402 \u00b7 agent-to-agent micropayments",
    hold: 2800,
  },
  {
    kind: "chat",
    messages: [
      { type: "user", text: "Run a risk analysis on my portfolio" },
      { type: "think", ms: 1200 },
      {
        type: "ai",
        tools: ["t2000_positions", "t2000_pay"],
        html: `<div class="nt" style="margin:0 0 8px">Paid <span class="hi">$0.05</span> via x402 to DeFi Risk API.</div><table><tr><td>Risk score</td><td class="hi">Low \u00b7 82/100</td></tr><tr><td>Health factor</td><td>1.8 (liquidation below 1.0)</td></tr><tr><td>Utilization</td><td>52% of borrowing capacity</td></tr><tr><td>Exposure</td><td>Single-protocol (NAVI)</td></tr></table><div class="nt">Position is healthy. Consider splitting across NAVI + Suilend to reduce single-protocol risk.</div>`,
        hold: 2800,
      },
    ],
  },
  { kind: "card", text: "t2000 MCP", sub: "NOW LIVE.", hold: 3000 },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface RenderedMsg {
  id: number;
  type: "user" | "ai" | "think";
  text?: string;
  html?: string;
  tools?: string[];
  err?: boolean;
  visible: boolean;
  pillsVisible: boolean;
}

function ChatScene({ messages, onDone }: { messages: MsgStep[]; onDone: () => void }) {
  const [rendered, setRendered] = useState<RenderedMsg[]>([]);
  const [frameIn, setFrameIn] = useState(false);
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;
    let id = 0;

    async function play() {
      setFrameIn(true);
      await sleep(500);

      for (const m of messages) {
        if (cancelRef.current) return;

        if (m.type === "user") {
          const msgId = id++;
          setRendered((prev) => [...prev, { id: msgId, type: "user", text: m.text, visible: false, pillsVisible: false }]);
          await sleep(50);
          setRendered((prev) => prev.map((p) => (p.id === msgId ? { ...p, visible: true } : p)));
          await sleep(400);
        } else if (m.type === "think") {
          const msgId = id++;
          setRendered((prev) => [...prev, { id: msgId, type: "think", visible: false, pillsVisible: false }]);
          await sleep(50);
          setRendered((prev) => prev.map((p) => (p.id === msgId ? { ...p, visible: true } : p)));
          await sleep(m.ms ?? 1000);
          setRendered((prev) => prev.filter((p) => p.id !== msgId));
        } else {
          const msgId = id++;
          setRendered((prev) => [
            ...prev,
            { id: msgId, type: "ai", html: m.html, tools: m.tools, err: m.err, visible: false, pillsVisible: false },
          ]);
          await sleep(50);
          setRendered((prev) => prev.map((p) => (p.id === msgId ? { ...p, visible: true } : p)));
          await sleep(150);
          setRendered((prev) => prev.map((p) => (p.id === msgId ? { ...p, pillsVisible: true } : p)));
          await sleep(m.hold ?? 600);
        }
      }

      if (!cancelRef.current) onDone();
    }

    play();
    return () => {
      cancelRef.current = true;
    };
  }, [messages, onDone]);

  return (
    <div
      className={`cw-chat-frame transition-all duration-600 ${frameIn ? "opacity-100 scale-100" : "opacity-0 scale-[0.96]"}`}
    >
      <div className="cw-chat-body">
        {rendered.map((msg) => {
          if (msg.type === "think") {
            return (
              <div
                key={msg.id}
                className={`cw-msg cw-msg-ai transition-all duration-400 ${msg.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2.5"}`}
              >
                <div className="cw-avatar">t</div>
                <div className="cw-thinking">
                  <span /><span /><span />
                </div>
              </div>
            );
          }

          if (msg.type === "user") {
            return (
              <div
                key={msg.id}
                className={`cw-msg cw-msg-user transition-all duration-400 ${msg.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2.5"}`}
              >
                <div className="cw-bubble-user">{msg.text}</div>
              </div>
            );
          }

          return (
            <div
              key={msg.id}
              className={`cw-msg cw-msg-ai transition-all duration-400 ${msg.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2.5"}`}
            >
              <div className="cw-avatar">t</div>
              <div className="cw-content">
                {msg.tools && (
                  <div className="cw-tools-row">
                    {msg.tools.map((t, i) => {
                      const fail = t.startsWith("\u2715");
                      return (
                        <span
                          key={i}
                          className={`cw-tool-pill transition-opacity duration-300 ${msg.pillsVisible ? "opacity-100" : "opacity-0"} ${fail ? "cw-tool-fail" : ""}`}
                        >
                          {fail ? t.slice(2) : t}
                        </span>
                      );
                    })}
                  </div>
                )}
                <div
                  className={`cw-bubble-ai ${msg.err ? "cw-bubble-err" : ""}`}
                  dangerouslySetInnerHTML={{ __html: msg.html ?? "" }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CardScene({
  text,
  sub,
  onDone,
  hold = 2800,
}: {
  text: string;
  sub?: string;
  onDone: () => void;
  hold?: number;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 200);
    const t2 = setTimeout(onDone, hold);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onDone, hold]);

  return (
    <div className="flex flex-col items-center justify-center text-center px-6">
      <div
        className={`font-serif text-[28px] sm:text-[40px] lg:text-[52px] font-normal italic leading-[1.15] text-[var(--cw-fg)] max-w-[600px] whitespace-pre-line transition-all duration-[900ms] ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}
      >
        {text}
      </div>
      {sub && (
        <div
          className={`font-mono text-xs sm:text-sm text-[var(--cw-muted)] mt-5 tracking-[0.5px] transition-opacity duration-600 delay-400 ${visible ? "opacity-100" : "opacity-0"}`}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function OutroScene() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center text-center px-6">
      <div
        className={`font-mono text-[48px] sm:text-[64px] font-semibold text-accent tracking-[-3px] transition-all duration-[900ms] ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        style={{ textShadow: "0 0 80px rgba(0,214,143,0.25)" }}
      >
        t2000
      </div>
      <div
        className={`font-serif italic text-base sm:text-lg text-[var(--cw-muted)] mt-3 transition-opacity duration-700 delay-300 ${visible ? "opacity-100" : "opacity-0"}`}
      >
        A bank account for the AI economy.
      </div>
      <div
        className={`font-mono text-sm text-accent bg-[rgba(0,214,143,0.12)] px-5 py-3 rounded-lg border border-[rgba(0,214,143,0.1)] mt-6 transition-opacity duration-700 delay-500 ${visible ? "opacity-100" : "opacity-0"}`}
      >
        npm i -g @t2000/cli
      </div>
      <div
        className={`font-mono text-xs text-[var(--cw-dim)] mt-4 tracking-[0.3px] transition-opacity duration-700 delay-700 ${visible ? "opacity-100" : "opacity-0"}`}
      >
        t2000.ai · github.com/mission69b/t2000
      </div>
    </div>
  );
}

export function CinematicWalkthrough() {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const isOutro = sceneIdx >= scenes.length;

  const advance = useCallback(() => {
    setSceneIdx((i) => i + 1);
  }, []);

  const replay = useCallback(() => {
    setSceneIdx(0);
    setPlaying(true);
  }, []);

  useEffect(() => {
    if (!isOutro || !playing) return;
    const t = setTimeout(() => {
      setPlaying(false);
    }, 5000);
    return () => clearTimeout(t);
  }, [isOutro, playing]);

  const scene = scenes[sceneIdx];

  return (
    <div className="cw-root relative w-full aspect-video max-w-4xl border border-border-bright rounded-sm overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center">
        {isOutro ? (
          <OutroScene key="outro" />
        ) : scene?.kind === "card" ? (
          <CardScene
            key={`card-${sceneIdx}`}
            text={scene.text}
            sub={scene.sub}
            hold={scene.hold}
            onDone={advance}
          />
        ) : scene?.kind === "chat" ? (
          <ChatScene
            key={`chat-${sceneIdx}`}
            messages={scene.messages}
            onDone={advance}
          />
        ) : null}
      </div>

      <button
        onClick={replay}
        className="absolute bottom-3 right-3 z-10 font-mono text-[11px] px-3 py-1.5 bg-panel text-[var(--cw-dim)] border border-border-bright rounded-md cursor-pointer hover:text-accent hover:border-accent transition-colors"
      >
        ↻ Replay
      </button>
    </div>
  );
}
