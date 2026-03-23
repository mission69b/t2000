'use client';

import { useState } from 'react';

interface AmountChipsProps {
  amounts: number[];
  allLabel?: string;
  onSelect: (amount: number) => void;
  message?: string;
}

export function AmountChips({ amounts, allLabel, onSelect, message }: AmountChipsProps) {
  const [custom, setCustom] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  if (showCustom) {
    return (
      <div className="rounded-xl bg-neutral-900 p-4 space-y-3">
        {message && <p className="text-sm text-neutral-400 whitespace-pre-line">{message}</p>}
        <div className="flex gap-2">
          <div className="flex-1 flex items-center bg-neutral-800 rounded-xl px-4">
            <span className="text-neutral-500">$</span>
            <input
              type="number"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="0.00"
              autoFocus
              className="flex-1 bg-transparent py-3 pl-1 text-sm text-white outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && custom) onSelect(parseFloat(custom));
              }}
            />
          </div>
          <button
            onClick={() => custom && onSelect(parseFloat(custom))}
            disabled={!custom || parseFloat(custom) <= 0}
            className="rounded-xl bg-white px-5 py-3 text-sm font-medium text-neutral-950 transition hover:bg-neutral-200 disabled:opacity-40"
          >
            Go
          </button>
        </div>
        <button
          onClick={() => setShowCustom(false)}
          className="text-xs text-neutral-500 hover:text-white transition"
        >
          ← Back to presets
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-neutral-900 p-4 space-y-3">
      {message && <p className="text-sm text-neutral-400 whitespace-pre-line">{message}</p>}
      <div className="flex flex-wrap gap-2">
        {amounts.map((a) => (
          <button
            key={a}
            onClick={() => onSelect(a)}
            className="rounded-full bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 transition active:scale-[0.95]"
          >
            ${a}
          </button>
        ))}
        {allLabel && (
          <button
            onClick={() => onSelect(-1)}
            className="rounded-full bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 transition active:scale-[0.95]"
          >
            {allLabel}
          </button>
        )}
        <button
          onClick={() => setShowCustom(true)}
          className="rounded-full bg-neutral-800 px-4 py-2 text-sm text-neutral-400 hover:text-white hover:bg-neutral-700 transition"
        >
          Custom
        </button>
      </div>
    </div>
  );
}
