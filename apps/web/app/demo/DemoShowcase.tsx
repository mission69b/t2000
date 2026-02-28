"use client";

import { useState } from "react";
import { DemoTerminal } from "../components/DemoTerminal";
import { demos } from "./demoData";

export function DemoShowcase() {
  const [activeId, setActiveId] = useState(demos[0].id);
  const activeDemo = demos.find((d) => d.id === activeId) ?? demos[0];

  return (
    <div>
      <nav className="flex flex-wrap gap-2 mb-8">
        {demos.map((demo) => (
          <button
            key={demo.id}
            onClick={() => setActiveId(demo.id)}
            className={`px-3 py-1.5 rounded text-xs font-mono transition-all border ${
              activeId === demo.id
                ? "bg-accent/10 text-accent border-accent/30"
                : "bg-panel text-muted border-border hover:border-border-bright hover:text-foreground"
            }`}
          >
            {demo.title}
          </button>
        ))}
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8 items-start">
        <div className="flex justify-center">
          <DemoTerminal
            key={activeId}
            lines={activeDemo.lines}
            title={`${activeDemo.title.split("—")[0].trim().toLowerCase()} — terminal`}
            height="440px"
          />
        </div>

        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-mono text-foreground mb-2">
              {activeDemo.title}
            </h2>
            <p className="text-muted text-sm leading-relaxed">
              {activeDemo.description}
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-[10px] text-muted uppercase tracking-widest">
              Commands used
            </div>
            <div className="flex flex-col gap-1.5">
              {activeDemo.lines
                .filter((l) => l.type === "command")
                .map((l, i) => (
                  <code
                    key={i}
                    className="text-xs font-mono text-accent/80 bg-accent/5 px-2 py-1 rounded border border-accent/10"
                  >
                    {l.text.replace("❯ ", "")}
                  </code>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
