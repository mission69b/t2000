'use client';

import { useState } from 'react';
import { highlight } from 'sugar-high';

export function CodeBlock({
  code,
  lang,
}: {
  code: string;
  lang?: string;
}) {
  const [copied, setCopied] = useState(false);

  const isPlainText = lang === 'text' || lang === 'plain';
  const html = isPlainText ? null : highlight(code);

  return (
    <div className="relative group">
      <pre className="sh text-[11px] bg-panel border border-border rounded-lg p-4 overflow-x-auto whitespace-pre leading-relaxed font-mono">
        {html ? (
          <code dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <code className="text-foreground/80">{code}</code>
        )}
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
