"use client";

import { useState } from "react";

interface InstallCommandProps {
  command?: string;
}

export function InstallCommand({ command = "npx t2000 init" }: InstallCommandProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="group inline-flex items-center gap-3 rounded-xl border border-border bg-surface px-6 py-3.5 font-mono text-base transition-all hover:border-accent/40 hover:shadow-[0_0_24px_rgba(0,212,255,0.08)]"
    >
      <span className="text-accent">$</span>
      <span className="text-foreground/90">{command}</span>
      <span className="ml-2 text-muted group-hover:text-accent transition-colors text-lg">
        {copied ? "✓" : "⎘"}
      </span>
    </button>
  );
}
