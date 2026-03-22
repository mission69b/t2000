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
      className="w-full text-left cursor-pointer group"
    >
      <code className="text-[11px] text-foreground/70 font-mono group-hover:text-foreground transition-colors">
        $ {SNIPPET}
      </code>
      <div className="text-[10px] text-dim mt-1 group-hover:text-muted transition-colors">
        {copied ? '✓ copied' : 'click to copy'}
      </div>
    </button>
  );
}
