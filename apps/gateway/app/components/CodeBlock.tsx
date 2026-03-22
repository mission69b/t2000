'use client';

import { useState } from 'react';

export function CodeBlock({
  code,
  lang = 'typescript',
}: {
  code: string;
  lang?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="relative group">
      <pre className="text-[11px] text-foreground/80 bg-panel border border-border rounded-lg p-4 overflow-x-auto whitespace-pre leading-relaxed font-mono">
        <code>{code}</code>
      </pre>
      <button
        onClick={() => {
          navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="absolute top-2.5 right-2.5 text-[9px] px-2 py-1 rounded bg-surface border border-border text-muted hover:text-foreground opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
      >
        {copied ? '✓ copied' : 'copy'}
      </button>
    </div>
  );
}
