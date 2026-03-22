'use client';

import { useState, useEffect, useCallback } from 'react';

interface Example {
  label: string;
  command: string;
  payment: string;
  response: string;
}

const EXAMPLES: Example[] = [
  {
    label: 'Mail a postcard',
    command: `$ t2000 pay https://mpp.t2000.ai/lob/v1/postcards \\
    --data '{
      "to": { "name": "Mom", "address": "379 University Ave..." },
      "message": "Miss you!"
    }'`,
    payment: '✓ Paid 1.50 USDC  ·  Tx: EXJvQd...sygq (0.4s)',
    response: `{
  "id": "psc_xxx",
  "carrier": "USPS",
  "expected_delivery": "Mar 28"
}`,
  },
  {
    label: 'Buy a gift card',
    command: `$ t2000 pay https://mpp.t2000.ai/reloadly/v1/order \\
    --data '{
      "productId": 4521,
      "unitPrice": 25,
      "recipientEmail": "me@email.com"
    }'`,
    payment: '✓ Paid 26.25 USDC  ·  Tx: FjhtzF...R5AC (0.5s)',
    response: `{
  "cardNumber": "XXXX-XXXX-XXXX",
  "brand": "Uber Eats",
  "value": "$25.00"
}`,
  },
  {
    label: 'Generate an image',
    command: `$ t2000 pay https://mpp.t2000.ai/fal/v1/image \\
    --data '{
      "prompt": "a neon-lit Tokyo alley in the rain, cyberpunk"
    }'`,
    payment: '✓ Paid 0.03 USDC  ·  Tx: 6aivNU...BjZv (0.3s)',
    response: `{
  "url": "https://fal.ai/output/abc123.png",
  "seed": 42
}`,
  },
  {
    label: 'Order a custom t-shirt',
    command: `$ t2000 pay https://mpp.t2000.ai/printful/v1/orders \\
    --data '{
      "product_id": 71,
      "design_url": "https://...",
      "ship_to": { "name": "Alex", "address": "..." }
    }'`,
    payment: '✓ Paid 18.50 USDC  ·  Tx: HnqYvR...k4Lm (0.4s)',
    response: `{
  "id": "ord_xxx",
  "status": "pending",
  "estimated_ship": "Mar 26"
}`,
  },
];

const CYCLE_MS = 8_000;

export function TerminalDemo() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [fadeKey, setFadeKey] = useState(0);

  const advance = useCallback(() => {
    if (!paused) {
      setActive((prev) => (prev + 1) % EXAMPLES.length);
      setFadeKey((k) => k + 1);
    }
  }, [paused]);

  useEffect(() => {
    const timer = setInterval(advance, CYCLE_MS);
    return () => clearInterval(timer);
  }, [advance]);

  const handleDotClick = (i: number) => {
    setActive(i);
    setFadeKey((k) => k + 1);
  };

  const example = EXAMPLES[active];

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="border border-border rounded-lg bg-panel overflow-hidden">
        {/* Title bar */}
        <div className="px-4 py-2 border-b border-border flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]/80" />
          </div>
          <span className="text-[10px] text-dim ml-2">terminal</span>
          <span className="text-[10px] text-dim/50 ml-auto">{example.label}</span>
        </div>

        {/* Content */}
        <div key={fadeKey} className="p-5 space-y-4 terminal-content">
          <pre className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed font-mono">
            {example.command}
          </pre>

          <div className="text-xs text-accent font-medium">
            {example.payment}
          </div>

          <pre className="text-xs text-foreground/60 whitespace-pre-wrap leading-relaxed font-mono">
            {example.response}
          </pre>

          <p className="text-[11px] text-dim pt-3 border-t border-border/50">
            No API key. No signup. One command.
          </p>
        </div>
      </div>

      {/* Dot navigation */}
      <div className="flex items-center justify-center gap-2 mt-4">
        {EXAMPLES.map((ex, i) => (
          <button
            key={i}
            onClick={() => handleDotClick(i)}
            className={`w-2 h-2 rounded-full transition-all cursor-pointer ${
              i === active
                ? 'bg-accent scale-125'
                : 'bg-dim hover:bg-muted'
            }`}
            title={ex.label}
          />
        ))}
      </div>
    </div>
  );
}
