'use client';

import { useCallback, useEffect, useState } from 'react';

interface ContactToastProps {
  address: string;
  onSave: (name: string) => void;
  onDismiss: () => void;
}

export function ContactToast({ address, onSave, onDismiss }: ContactToastProps) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState('');
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!expanded) {
      const timer = setTimeout(() => setVisible(false), 8000);
      return () => clearTimeout(timer);
    }
  }, [expanded]);

  useEffect(() => {
    if (!visible) {
      const fade = setTimeout(onDismiss, 300);
      return () => clearTimeout(fade);
    }
  }, [visible, onDismiss]);

  const handleSave = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
  }, [name, onSave]);

  const truncated = `${address.slice(0, 6)}...${address.slice(-4)}`;

  return (
    <div
      className={`rounded-xl bg-neutral-900 border border-neutral-800 p-4 transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
    >
      {!expanded ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-neutral-300">
            Save <span className="font-mono text-white">{truncated}</span> as a contact?
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setExpanded(true)}
              className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-neutral-950 hover:bg-neutral-200 transition"
            >
              Save
            </button>
            <button
              onClick={() => setVisible(false)}
              className="rounded-lg bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-white transition"
            >
              Skip
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-neutral-400">
            Name for <span className="font-mono text-neutral-300">{truncated}</span>
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              placeholder="e.g. Alice, Rent, Exchange"
              autoFocus
              className="flex-1 rounded-lg bg-neutral-800 px-3 py-2 text-sm text-white placeholder:text-neutral-600 outline-none focus:ring-1 focus:ring-neutral-700"
            />
            <button
              onClick={handleSave}
              disabled={!name.trim()}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-200 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
