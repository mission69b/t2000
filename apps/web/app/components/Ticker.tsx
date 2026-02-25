"use client";

const DEFI_ITEMS = [
  { name: "USDC/SUI", value: "0.2847", change: "+0.42%", up: true },
  { name: "NAVI APY", value: "4.21%", change: "+0.08%", up: true },
  { name: "SUI Price", value: "$3.47", change: "-1.2%", up: false },
  { name: "Borrow Rate", value: "7.83%", change: "-0.1%", up: false },
  { name: "Cetus TVL", value: "$412M", change: "+2.1%", up: true },
  { name: "Sui TPS", value: "8,240", change: "↑", up: true },
];

const X402_ITEMS = [
  { name: "agent_0x3f · paid", value: "$0.01 USDC", change: "✓ verified", up: true },
  { name: "weather.api", value: "$0.005 USDC", change: "✓ 200ms", up: true },
  { name: "agent_0x9a · borrow", value: "$40 USDC", change: "✓ HF 2.1", up: true },
  { name: "data.feed", value: "$0.002 USDC", change: "✓ 340ms", up: true },
  { name: "agent_0x7c · save", value: "$200 USDC", change: "✓ 4.21% APY", up: true },
  { name: "swap USDC→SUI", value: "$50", change: "✓ 0.003s", up: true },
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
      {/* Row 1: DeFi */}
      <div className="flex items-center border-b border-border">
        <div className="hidden sm:flex shrink-0 w-[80px] items-center px-4 py-3.5 text-[10px] tracking-[0.1em] uppercase text-dim border-r border-border">
          Sui · DeFi
        </div>
        <div className="flex-1 overflow-hidden relative">
          <div className="absolute inset-y-0 left-0 w-10 sm:w-15 bg-gradient-to-r from-surface to-transparent z-2" />
          <div className="absolute inset-y-0 right-0 w-10 sm:w-15 bg-gradient-to-l from-surface to-transparent z-2" />
          <div className="flex gap-10 whitespace-nowrap animate-ticker py-3.5 px-4 sm:px-8">
            <TickerItems items={DEFI_ITEMS} />
            <TickerItems items={DEFI_ITEMS} />
          </div>
        </div>
      </div>

      {/* Row 2: x402 */}
      <div className="flex items-center">
        <div className="hidden sm:flex shrink-0 w-[80px] items-center px-4 py-3.5 text-[10px] tracking-[0.1em] uppercase text-dim border-r border-border">
          x402 · Live
        </div>
        <div className="flex-1 overflow-hidden relative">
          <div className="absolute inset-y-0 left-0 w-10 sm:w-15 bg-gradient-to-r from-surface to-transparent z-2" />
          <div className="absolute inset-y-0 right-0 w-10 sm:w-15 bg-gradient-to-l from-surface to-transparent z-2" />
          <div className="flex gap-10 whitespace-nowrap animate-ticker-reverse py-3.5 px-4 sm:px-8">
            <TickerItems items={X402_ITEMS} />
            <TickerItems items={X402_ITEMS} />
          </div>
        </div>
      </div>
    </div>
  );
}
