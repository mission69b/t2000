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
      className="group inline-flex items-center gap-3 px-7 py-4 rounded-md font-mono text-[13px] transition-all hover:shadow-[0_0_24px_var(--accent-glow)] cursor-pointer max-w-full overflow-x-auto scrollbar-hide bg-surface border border-border"
    >
      <span className="text-accent shrink-0">$</span>
      <span className="whitespace-nowrap transition-colors text-foreground">{command}</span>
      <span className="ml-2 text-accent text-[11px] shrink-0">
        {copied ? "Copied!" : ""}
      </span>
    </button>
  );
}
