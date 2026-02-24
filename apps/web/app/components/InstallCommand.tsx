"use client";

import { useState } from "react";

export function InstallCommand() {
  const [copied, setCopied] = useState(false);
  const command = "npm install -g @t2000/cli";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="group inline-flex items-center gap-3 rounded-xl border border-border bg-card px-6 py-3 font-mono text-sm transition-colors hover:border-accent/40 hover:bg-card/80"
    >
      <span className="text-accent">$</span>
      <span className="text-zinc-300">{command}</span>
      <span className="ml-2 text-muted group-hover:text-accent transition-colors">
        {copied ? "✓" : "⎘"}
      </span>
    </button>
  );
}
