"use client";

import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { useEffect, useRef, useState } from "react";

interface CoinRow {
  coinType: string;
  symbol: string;
  amount: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

// Parses the relayed OpenAI-format SSE stream: `data: {json}` lines,
// terminated by `data: [DONE]`. ~30 lines instead of an SDK.
async function streamAgent(
  body: object,
  onDelta: (text: string) => void,
): Promise<string | null> {
  const res = await fetch("/api/agent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(err?.error ?? `Request failed (${res.status})`);
  }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      for (const line of event.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6);
        if (payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[];
          };
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) onDelta(delta);
        } catch {
          // partial/keepalive line — ignore
        }
      }
    }
  }
  return res.headers.get("x-t2000-served-model");
}

export default function Home() {
  const account = useCurrentAccount();
  const [coins, setCoins] = useState<CoinRow[] | null>(null);

  useEffect(() => {
    if (!account) {
      setCoins(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/balance?owner=${account.address}`)
      .then((r) => r.json())
      .then((d: { coins?: CoinRow[] }) => {
        if (!cancelled) setCoins(d.coins ?? []);
      })
      .catch(() => {
        if (!cancelled) setCoins([]);
      });
    return () => {
      cancelled = true;
    };
  }, [account]);

  return (
    <main className="shell">
      <header>
        <h1>sui-dapp</h1>
        <ConnectButton />
      </header>

      <section className="panel">
        <h2>Wallet</h2>
        {!account && (
          <p className="muted">
            Connect a wallet to see holdings — reads go through gRPC
            (JSON-RPC is retiring), and the AI copilot picks up your balances
            as context.
          </p>
        )}
        {account && (
          <>
            <p className="mono muted">{account.address}</p>
            {coins === null && <p className="muted">Loading balances…</p>}
            {coins !== null && coins.length === 0 && (
              <p className="muted">No coins in this wallet.</p>
            )}
            {coins !== null && coins.length > 0 && (
              <ul className="coins">
                {coins.map((c) => (
                  <li key={c.coinType}>
                    <span className="mono">{c.amount}</span> {c.symbol}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <Copilot
        wallet={
          account
            ? {
                address: account.address,
                coins: (coins ?? []).map(({ symbol, amount }) => ({
                  symbol,
                  amount,
                })),
              }
            : undefined
        }
      />
    </main>
  );
}

function Copilot({
  wallet,
}: {
  wallet?: { address: string; coins: { symbol: string; amount: string }[] };
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [served, setServed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    const history: Message[] = [...messages, { role: "user", content: text }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    setError(null);

    try {
      const servedModel = await streamAgent(
        { messages: history, wallet },
        (delta) => {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            next[next.length - 1] = { ...last, content: last.content + delta };
            return next;
          });
          bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        },
      );
      setServed(servedModel);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMessages(history);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel copilot">
      <h2>
        Copilot
        <span className="badge">
          t2000/auto{served ? ` · served by ${served}` : ""}
        </span>
      </h2>

      <div className="messages">
        {messages.length === 0 && (
          <p className="muted">
            Ask about your holdings, Sui objects, PTBs, or this codebase.
            Private by default — this repo is pinned in{" "}
            <code>.t2000/config.json</code>.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.content || (busy && i === messages.length - 1 ? "…" : "")}
          </div>
        ))}
        {error && <div className="error">{error}</div>}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={wallet ? "Ask about your wallet…" : "Ask about Sui…"}
        />
        <button type="submit" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}
