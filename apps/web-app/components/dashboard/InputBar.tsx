'use client';

import { useState, useCallback, type KeyboardEvent } from 'react';

interface InputBarProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function InputBar({ onSubmit, disabled, placeholder = 'Ask anything...' }: InputBarProps) {
  const [value, setValue] = useState('');

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue('');
  }, [value, onSubmit]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        aria-label="Message t2000"
        className="flex-1 rounded-sm border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder:text-dim outline-none focus:border-border-bright disabled:opacity-50"
      />
      {value.trim() && (
        <button
          onClick={handleSubmit}
          disabled={disabled}
          className="bg-accent p-3 text-background tracking-[0.05em] uppercase transition hover:bg-accent/90 hover:bg-[#00f0a0] hover:shadow-[0_0_20px_var(--accent-glow)] disabled:opacity-50"
          aria-label="Send"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
          </svg>
        </button>
      )}
    </div>
  );
}
