"use client";

const DEFI_ITEMS = [
  { name: "Savings APY", value: "4.21%", change: "+0.08%", up: true },
  { name: "SUI", value: "$0.91", change: "-1.2%", up: false },
  { name: "BTC", value: "$97,421", change: "+0.8%", up: true },
  { name: "ETH", value: "$3,201", change: "+0.3%", up: true },
  { name: "Borrow Rate", value: "7.83%", change: "-0.1%", up: false },
  { name: "USDC/SUI", value: "1.0989", change: "+0.42%", up: true },
  { name: "Gold", value: "$2,934", change: "+0.2%", up: true },
];

const AGENT_ITEMS = [
  { name: "agent_0x3f · saved", value: "$200 USDC", change: "✓ 4.21% APY", up: true },
  { name: "agent_0x9a · borrowed", value: "$40 USDC", change: "✓ healthy", up: true },
  { name: "agent_0x7c · invested", value: "$100 SUI", change: "✓ bluechip", up: true },
  { name: "agent_0xb1 · sent", value: "$25 to alice", change: "✓ confirmed", up: true },
  { name: "agent_0x4e · paid API", value: "$0.01 USDC", change: "✓ 380ms", up: true },
];

function TickerItems({ items }: { items: typeof DEFI_ITEMS }) {
  return (
    <>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-2.5 text-xs shrink-0">
          <span className="text-muted">{item.name}</span>
          <span className="text-dim">·</span>
          <span className="text-foreground">{item.value}</span>
          <span className={item.up ? "text-accent" : "text-danger"}>
            {item.change}
          </span>
        </span>
      ))}
    </>
  );
}

export function Ticker() {
  return (
    <div className="relative z-1 border-t border-b border-border bg-surface overflow-hidden">
      {/* Row 1: Markets */}
      <div className="flex items-center border-b border-border">
        <div className="hidden sm:block shrink-0 w-[100px] px-6 py-3.5 text-[10px] tracking-[0.15em] uppercase text-dim border-r border-border">
          Markets
        </div>
        <div className="flex-1 overflow-hidden relative">
          <div className="absolute inset-y-0 left-0 w-10 sm:w-15 bg-gradient-to-r from-surface to-transparent z-2" />
          <div className="absolute inset-y-0 right-0 w-10 sm:w-15 bg-gradient-to-l from-surface to-transparent z-2" />
          <div className="flex gap-8 whitespace-nowrap animate-ticker py-3.5 px-4 sm:px-7">
            <TickerItems items={DEFI_ITEMS} />
            <TickerItems items={DEFI_ITEMS} />
          </div>
        </div>
      </div>

      {/* Row 2: Agent activity */}
      <div className="flex items-center">
        <div className="hidden sm:block shrink-0 w-[100px] px-6 py-3.5 text-[10px] tracking-[0.15em] uppercase text-dim border-r border-border">
          Agents
        </div>
        <div className="flex-1 overflow-hidden relative">
          <div className="absolute inset-y-0 left-0 w-10 sm:w-15 bg-gradient-to-r from-surface to-transparent z-2" />
          <div className="absolute inset-y-0 right-0 w-10 sm:w-15 bg-gradient-to-l from-surface to-transparent z-2" />
          <div className="flex gap-8 whitespace-nowrap animate-ticker-reverse py-3.5 px-4 sm:px-7">
            <TickerItems items={AGENT_ITEMS} />
            <TickerItems items={AGENT_ITEMS} />
          </div>
        </div>
      </div>
    </div>
  );
}
