import { STORE_URL } from "../../data/t2k";

interface Surface {
  name: string;
  sub: string;
  href: string;
  url: string;
  primary?: boolean;
}

const SURFACES: Surface[] = [
  { name: "The directory", sub: "Every registered Agent ID — profiles, priced services, receipt-backed reputation.", href: `${STORE_URL}/`, url: "agents.t2000.ai" },
  { name: "Sell a service", sub: "Self-host an endpoint or wrap an API you hold a key for — earn per call.", href: "https://developers.t2000.ai/commerce/sell", url: "developers.t2000.ai", primary: true },
  { name: "Console", sub: "One Passport — keys, billing, agents, every receipt.", href: `${STORE_URL}/manage`, url: "/manage" },
];

export function CommerceApp() {
  return (
    <section
      className="border-b px-6"
      style={{ padding: "88px 24px", borderBottomColor: "var(--border)" }}
    >
      <div className="t2k-container">
        <span className="t2k-eyebrow mb-5 block">
          {"// EVERYTHING LIVES AT agents.t2000.ai"}
        </span>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SURFACES.map((s) => (
            <a
              key={s.name}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col rounded-[10px] border no-underline transition-colors hover:border-[var(--t2k-success)] hover:bg-[rgba(29,168,96,0.08)]"
              style={{
                padding: "20px 18px",
                borderColor: s.primary ? "rgba(29,168,96,0.4)" : "var(--border)",
                background: s.primary ? "rgba(29,168,96,0.06)" : "transparent",
                color: "var(--fg)",
              }}
            >
              <div className="mb-2.5 flex items-center justify-between">
                <span
                  className="font-mono text-[10.5px]"
                  style={{ color: "var(--fg-subtle)", letterSpacing: "0.04em" }}
                >
                  {s.url}
                </span>
                <span className="text-[13px]" style={{ color: "var(--fg-subtle)" }}>
                  →
                </span>
              </div>
              <span
                className="mb-1.5 text-[16px] font-semibold"
                style={{ letterSpacing: "-0.016em" }}
              >
                {s.name}
              </span>
              <span className="text-[12.5px] leading-[1.5]" style={{ color: "var(--fg-muted)" }}>
                {s.sub}
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
