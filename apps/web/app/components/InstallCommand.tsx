"use client";

import { useState } from "react";

interface InstallCommandProps {
  command?: string;
}

export function InstallCommand({
  command = "npm install -g @t2000/cli",
}: InstallCommandProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="group inline-flex items-center gap-3 border border-border-bright bg-surface px-6 py-4 rounded font-mono text-sm transition-all hover:border-accent hover:text-accent hover:shadow-[0_0_20px_var(--accent-glow)] cursor-pointer max-w-full overflow-x-auto scrollbar-hide"
    >
      <span className="text-accent shrink-0">$</span>
      <span className="text-foreground whitespace-nowrap group-hover:text-accent transition-colors">{command}</span>
      <span className="ml-2 text-accent text-[11px] shrink-0">
        {copied ? "Copied!" : ""}
      </span>
    </button>
  );
}
