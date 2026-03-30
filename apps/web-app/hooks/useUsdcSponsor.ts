import { useEffect, useRef } from 'react';

const LS_KEY = 't2000_usdc_sponsored';

export function useUsdcSponsor(address: string | null) {
  const attempted = useRef(false);

  useEffect(() => {
    if (!address || attempted.current) return;

    const sponsored = localStorage.getItem(LS_KEY);
    if (sponsored) {
      const parsed = JSON.parse(sponsored) as Record<string, boolean>;
      if (parsed[address]) return;
    }

    attempted.current = true;

    (async () => {
      try {
        const res = await fetch('/api/sponsor/usdc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address }),
        });

        if (res.ok || res.status === 409) {
          const existing = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}');
          existing[address] = true;
          localStorage.setItem(LS_KEY, JSON.stringify(existing));
        }

        if (res.ok) {
          const data = await res.json();
          console.log(`[sponsor] USDC sponsored: ${data.usdcFunded} USDC (tx: ${data.digest})`);
        }
      } catch (err) {
        console.warn('[sponsor] USDC sponsorship failed:', err);
      }
    })();
  }, [address]);
}
