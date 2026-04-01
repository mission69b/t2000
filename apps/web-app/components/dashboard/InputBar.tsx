'use client';

import { useState, useCallback, useRef, useEffect, type KeyboardEvent } from 'react';

interface InputBarProps {
  onSubmit: (text: string) => void;
  onCancel?: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export function InputBar({
  onSubmit,
  onCancel,
  disabled,
  placeholder = 'Ask anything...',
}: InputBarProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  useEffect(() => {
    resize();
  }, [value, resize]);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue('');
  }, [value, onSubmit]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (value.trim()) {
          setValue('');
        } else if (onCancel) {
          onCancel();
        }
      }
    },
    [handleSubmit, value, onCancel],
  );

  return (
    <div className="flex items-end gap-2">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        aria-label="Message Audric"
        className="flex-1 resize-none rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-dim outline-none focus:border-border-bright disabled:opacity-50 max-h-40 leading-relaxed"
      />
      {value.trim() && (
        <button
          onClick={handleSubmit}
          disabled={disabled}
          className="shrink-0 bg-foreground rounded-lg p-3 text-background transition hover:opacity-80 disabled:opacity-50 active:scale-[0.97]"
          aria-label="Send message"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
          </svg>
        </button>
      )}
    </div>
  );
}
