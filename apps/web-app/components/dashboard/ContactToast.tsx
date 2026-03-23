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
      className={`rounded-xl border border-border bg-surface p-4 transition-all duration-300 feed-row ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
    >
      {!expanded ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">
            Save <span className="font-mono text-foreground">{truncated}</span> as a contact?
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setExpanded(true)}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-background hover:bg-accent/90 transition"
            >
              Save
            </button>
            <button
              onClick={() => setVisible(false)}
              className="rounded-lg border border-border bg-panel px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground transition"
            >
              Skip
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Name for <span className="font-mono text-foreground">{truncated}</span>
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              placeholder="e.g. Alice, Rent, Exchange"
              autoFocus
              className="flex-1 rounded-lg border border-border bg-panel px-3 py-2 text-sm text-foreground placeholder:text-dim outline-none focus:border-border-bright"
            />
            <button
              onClick={handleSave}
              disabled={!name.trim()}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-background hover:bg-accent/90 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
