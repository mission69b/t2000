'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface Command {
  label: string;
  cmd: string;
  payment: string;
  response: string;
}

const COMMANDS: Command[] = [
  {
    label: 'Mail a postcard',
    cmd: `t2000 pay https://mpp.t2000.ai/lob/v1/postcards \\
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
    cmd: `t2000 pay https://mpp.t2000.ai/reloadly/v1/order \\
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
    cmd: `t2000 pay https://mpp.t2000.ai/fal/v1/image \\
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
    cmd: `t2000 pay https://mpp.t2000.ai/printful/v1/orders \\
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

type Phase = 'prompt' | 'running' | 'result';

const AUTO_RUN_MS = 2_500;
const AUTO_NEXT_MS = 3_500;

export function TerminalDemo() {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('prompt');
  const [showPayment, setShowPayment] = useState(false);
  const [showResponse, setShowResponse] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const termRef = useRef<HTMLDivElement>(null);

  const cmd = COMMANDS[idx];

  const resetTo = useCallback((nextIdx: number) => {
    clearTimeout(timerRef.current);
    setIdx(nextIdx);
    setPhase('prompt');
    setShowPayment(false);
    setShowResponse(false);
  }, []);

  const run = useCallback(() => {
    clearTimeout(timerRef.current);
    setPhase('running');
    setShowPayment(false);
    setShowResponse(false);

    setTimeout(() => {
      setShowPayment(true);
      setTimeout(() => {
        setShowResponse(true);
        setPhase('result');
      }, 400);
    }, 600);
  }, []);

  useEffect(() => {
    clearTimeout(timerRef.current);

    if (phase === 'prompt') {
      timerRef.current = setTimeout(run, AUTO_RUN_MS);
    } else if (phase === 'result') {
      timerRef.current = setTimeout(() => {
        resetTo((idx + 1) % COMMANDS.length);
      }, AUTO_NEXT_MS);
    }

    return () => clearTimeout(timerRef.current);
  }, [phase, idx, run, resetTo]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        resetTo((idx - 1 + COMMANDS.length) % COMMANDS.length);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        resetTo((idx + 1) % COMMANDS.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (phase === 'prompt') run();
        else if (phase === 'result')
          resetTo((idx + 1) % COMMANDS.length);
      }
    },
    [idx, phase, run, resetTo],
  );

  const handleTap = useCallback(() => {
    if (phase === 'prompt') run();
    else if (phase === 'result')
      resetTo((idx + 1) % COMMANDS.length);
  }, [phase, idx, run, resetTo]);

  return (
    <div>
      <div
        ref={termRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onClick={handleTap}
        className="border border-border rounded-lg bg-panel overflow-hidden outline-none focus:border-accent/30 transition-colors cursor-pointer select-none"
      >
        <div className="px-4 py-2 border-b border-border flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]/80" />
          </div>
          <span className="text-[10px] text-dim ml-2">terminal</span>
          <span className="text-[10px] text-dim/50 ml-auto">
            {cmd.label}
          </span>
        </div>

        <div className="grid font-mono">
          {COMMANDS.map((c, i) => {
            const isActive = i === idx;
            return (
              <div
                key={i}
                className={`p-5 space-y-4 col-start-1 row-start-1 ${
                  isActive ? '' : 'invisible'
                }`}
              >
                <pre className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">
                  <span className="text-muted">$ </span>
                  {c.cmd}
                  {isActive && phase === 'prompt' && (
                    <span className="terminal-cursor" />
                  )}
                </pre>

                <div
                  className={`text-xs font-medium ${
                    isActive && showPayment
                      ? 'text-accent terminal-line'
                      : isActive && phase === 'running'
                        ? 'text-dim animate-pulse'
                        : 'opacity-0'
                  }`}
                >
                  {isActive && showPayment ? c.payment : 'paying...'}
                </div>

                <pre
                  className={`text-xs text-foreground/60 whitespace-pre-wrap leading-relaxed ${
                    isActive && showResponse ? 'terminal-line' : 'opacity-0'
                  }`}
                >
                  {c.response}
                </pre>

                <p
                  className={`text-[11px] text-dim pt-3 border-t border-border/50 ${
                    isActive && showResponse ? 'terminal-line' : 'opacity-0 border-transparent'
                  }`}
                >
                  No API key. No signup. One command.
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-center gap-1.5 mt-3 select-none">
        {COMMANDS.map((_, i) => (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-full transition-colors ${
              i === idx ? 'bg-accent' : 'bg-dim/50'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
