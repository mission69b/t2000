import { Fragment } from "react";

interface CodeLine {
  p?: string;
  cmd?: string;
  rest?: string;
  arg?: string;
  num?: string;
  tail?: string;
}

const SELF_HOSTED: CodeLine[] = [
  { p: "$ ", cmd: "t2 agent service", rest: " \\" },
  { rest: "  --mcp-endpoint ", arg: '"https://my-agent.example/mcp"', tail: " \\" },
  { rest: "  --payment-methods ", arg: '"x402"', tail: " \\" },
  { rest: "  --price ", num: "0.02", tail: " \\" },
  { rest: "  --category ", arg: "data-feeds" },
];

const WRAP: CodeLine[] = [
  { p: "$ ", cmd: "t2 agent deploy", rest: " \\" },
  { rest: "  --upstream ", arg: '"https://api.example.com/v1"', tail: " \\" },
  { rest: "  --header ", arg: '"Authorization=Bearer KEY"', tail: " \\" },
  { rest: "  --price ", num: "0.02", tail: " \\" },
  { rest: "  --category ", arg: "data-feeds" },
];

export function CommerceDeclare() {
  return (
    <section
      className="border-b px-6"
      style={{ padding: "88px 24px", borderBottomColor: "var(--border)" }}
    >
      <div className="t2k-container">
        <span className="t2k-eyebrow mb-3.5 block">{"// LIST A SERVICE"}</span>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: "clamp(28px, 3.6vw, 40px)",
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
            margin: "0 0 12px",
            color: "var(--fg)",
          }}
        >
          One command to get paid.
        </h2>
        <p
          className="m-0 mb-10 max-w-[560px] text-[15.5px] leading-[1.6]"
          style={{ color: "var(--fg-muted)" }}
        >
          Have your own endpoint? Declare it with a price. Don&rsquo;t? Wrap
          any HTTP API and t2000 hosts the proxy — your key never leaves the
          server.
        </p>

        <div className="grid gap-[18px] lg:grid-cols-2">
          <DeclareCard
            tag="SELF-HOSTED"
            title="Declare a service"
            sub="Point the store at an endpoint you already run."
            lines={SELF_HOSTED}
            note="Lights up the Service · x402 · price columns on your listing. Re-run to change any field — it merges."
          />
          <DeclareCard
            tag="NO SERVER"
            title="Wrap any API"
            sub="t2000 hosts the proxy. Your key stays encrypted, server-side."
            lines={WRAP}
            note="Upstream + headers stored encrypted, injected only at call time inside the paid flow. No public proxy URL to bypass payment."
          />
        </div>

        <div
          className="mt-[18px] rounded-lg border text-[13.5px] leading-[1.6]"
          style={{
            padding: "16px 18px",
            borderColor: "var(--border)",
            background: "var(--ds-gray-alpha-100)",
            color: "var(--fg-muted)",
          }}
        >
          <span style={{ color: "var(--fg)", fontWeight: 500 }}>
            A price alone isn&rsquo;t a service.
          </span>{" "}
          A listing is purchasable only when it has a delivery endpoint.
          Price-without-endpoint is payment-only mode — the
          store labels it as such on the listing.
        </div>
      </div>
    </section>
  );
}

function DeclareCard({
  tag,
  title,
  sub,
  lines,
  note,
}: {
  tag: string;
  title: string;
  sub: string;
  lines: CodeLine[];
  note: string;
}) {
  return (
    <div
      className="flex flex-col overflow-hidden rounded-[10px] border"
      style={{
        borderColor: "var(--border)",
        background: "var(--ds-background-200)",
      }}
    >
      <div
        className="border-b"
        style={{ padding: "18px 20px 14px", borderBottomColor: "var(--border)" }}
      >
        <div
          className="mb-2.5 font-mono text-[10px]"
          style={{ color: "var(--t2k-success)", letterSpacing: "0.08em" }}
        >
          {tag}
        </div>
        <div
          className="mb-1 text-[17px] font-semibold"
          style={{ letterSpacing: "-0.018em", color: "var(--fg)" }}
        >
          {title}
        </div>
        <div className="text-[13px] leading-[1.5]" style={{ color: "var(--fg-muted)" }}>
          {sub}
        </div>
      </div>
      <pre
        className="m-0 flex-1 whitespace-pre-wrap break-words font-mono text-[12.5px]"
        style={{
          padding: "18px 20px",
          lineHeight: 1.85,
          color: "var(--fg)",
          background: "var(--bg-elevated)",
        }}
      >
        {lines.map((l, i) => (
          <Fragment key={i}>
            {l.p && <span style={{ color: "var(--fg-subtle)" }}>{l.p}</span>}
            {l.cmd && <span style={{ color: "var(--t2k-accent)" }}>{l.cmd}</span>}
            {l.rest && <span style={{ color: "var(--fg-muted)" }}>{l.rest}</span>}
            {l.arg && <span style={{ color: "var(--ds-amber-700)" }}>{l.arg}</span>}
            {l.num && <span style={{ color: "var(--t2k-success)" }}>{l.num}</span>}
            {l.tail && <span style={{ color: "var(--fg-subtle)" }}>{l.tail}</span>}
            {i < lines.length - 1 && "\n"}
          </Fragment>
        ))}
      </pre>
      <div
        className="border-t text-[12.5px] leading-[1.55]"
        style={{
          padding: "13px 20px",
          borderTopColor: "var(--border)",
          color: "var(--fg-muted)",
        }}
      >
        {note}
      </div>
    </div>
  );
}
