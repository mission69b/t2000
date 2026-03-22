'use client';

import { useState } from 'react';

const SNIPPET = 'npm i -g @t2000/cli && t2000 init';

export function CopyInstall() {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(SNIPPET);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="w-full text-left cursor-pointer group flex items-center gap-2"
    >
      <code className="text-[11px] text-foreground/70 font-mono group-hover:text-foreground transition-colors truncate">
        $ {SNIPPET}
      </code>
      <span className={`text-[9px] shrink-0 transition-colors ${copied ? 'text-accent' : 'text-transparent group-hover:text-muted'}`}>
        {copied ? '✓' : 'copy'}
      </span>
    </button>
  );
}
