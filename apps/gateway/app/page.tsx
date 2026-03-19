'use client';

import { useState } from 'react';
import { services, type Service } from '@/lib/services';

const METHOD_COLORS: Record<string, string> = {
  POST: 'bg-blue-500/15 text-blue-400',
  GET: 'bg-green-500/15 text-green-400',
};

function ServiceRow({ service, isOpen, onToggle }: {
  service: Service;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-surface/60 transition-colors cursor-pointer"
      >
        <img
          src={service.logo}
          alt={service.name}
          className="w-6 h-6 shrink-0 opacity-70"
          style={{ filter: 'brightness(0) invert(1)' }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-foreground font-medium">{service.name}</span>
            {service.categories.map((c) => (
              <span
                key={c}
                className="text-[10px] uppercase tracking-wider text-muted bg-panel px-2 py-0.5 rounded"
              >
                {c}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-muted mb-0.5">{service.description}</p>
          <code className="text-[11px] text-dim font-mono">{service.serviceUrl}</code>
        </div>
        <div className="text-xs text-muted font-mono shrink-0">
          {service.endpoints.length} endpoint{service.endpoints.length > 1 ? 's' : ''}
        </div>
        <svg
          className={`w-4 h-4 text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="px-5 pb-4">
          <div className="bg-panel border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="text-left px-4 py-2.5 font-normal w-20">Method</th>
                  <th className="text-left px-4 py-2.5 font-normal">Path</th>
                  <th className="text-left px-4 py-2.5 font-normal hidden sm:table-cell">Description</th>
                  <th className="text-right px-4 py-2.5 font-normal w-20">Price</th>
                </tr>
              </thead>
              <tbody>
                {service.endpoints.map((ep) => (
                  <tr key={ep.path} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${METHOD_COLORS[ep.method] ?? ''}`}>
                        {ep.method}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-foreground">{ep.path}</td>
                    <td className="px-4 py-2.5 text-muted hidden sm:table-cell">{ep.description}</td>
                    <td className="px-4 py-2.5 text-right text-accent font-medium">${ep.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="text-[10px] text-muted hover:text-foreground transition-colors cursor-pointer"
    >
      {copied ? 'copied' : 'copy'}
    </button>
  );
}

export default function GatewayPage() {
  const [openService, setOpenService] = useState<string | null>('openai');

  const cliSnippet = `t2000 pay https://mpp.t2000.ai/openai/v1/chat/completions \\
  --data '{"model":"gpt-4o","messages":[...]}' \\
  --max-price 0.05`;

  const sdkSnippet = `import { T2000 } from '@t2000/sdk';

const agent = await T2000.create();

const result = await agent.pay({
  url: 'https://mpp.t2000.ai/openai/v1/chat/completions',
  body: JSON.stringify({ model: 'gpt-4o', messages: [...] }),
  maxPrice: 0.05,
});`;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="https://t2000.ai" className="text-foreground font-medium hover:text-accent transition-colors">
              t2000
            </a>
            <span className="text-dim">/</span>
            <span className="text-muted">services</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted">
            <a href="/api/services" className="hover:text-foreground transition-colors">
              /api/services
            </a>
            <a href="/llms.txt" className="hover:text-foreground transition-colors">
              /llms.txt
            </a>
            <a
              href="https://t2000.ai/docs"
              className="hover:text-foreground transition-colors"
            >
              docs
            </a>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-10 lg:flex lg:gap-10">
        {/* Main — Service Directory */}
        <main className="flex-1 min-w-0">
          <div className="mb-8">
            <h1 className="text-xl font-medium text-foreground mb-2">
              Services
              <span className="text-accent ml-2 text-sm font-normal">Sui USDC</span>
            </h1>
            <p className="text-sm text-muted max-w-xl">
              Pay-per-request APIs. No keys, no accounts — agents pay with{' '}
              <a href="https://mpp.dev" className="text-accent hover:underline">
                MPP
              </a>.
            </p>
          </div>

          {/* Stats */}
          <div className="flex gap-6 mb-8 text-xs">
            <div>
              <span className="text-muted">Services</span>
              <span className="ml-2 text-foreground font-medium">{services.length}</span>
            </div>
            <div>
              <span className="text-muted">Endpoints</span>
              <span className="ml-2 text-foreground font-medium">
                {services.reduce((sum, s) => sum + s.endpoints.length, 0)}
              </span>
            </div>
            <div>
              <span className="text-muted">Chain</span>
              <span className="ml-2 text-accent font-medium">Sui</span>
            </div>
            <div>
              <span className="text-muted">Currency</span>
              <span className="ml-2 text-foreground font-medium">USDC</span>
            </div>
          </div>

          {/* Service List */}
          <div className="border border-border rounded-lg overflow-hidden bg-surface/40">
            {services.map((svc) => (
              <ServiceRow
                key={svc.id}
                service={svc}
                isOpen={openService === svc.id}
                onToggle={() => setOpenService(openService === svc.id ? null : svc.id)}
              />
            ))}
          </div>

          {/* How it works */}
          <div className="mt-8 p-5 border border-border rounded-lg bg-surface/40">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <div className="text-accent font-medium mb-1">1. Request</div>
                <p className="text-muted">Call any endpoint. Get a 402 payment challenge.</p>
              </div>
              <div>
                <div className="text-accent font-medium mb-1">2. Pay</div>
                <p className="text-muted">USDC on Sui. ~400ms settlement, &lt;$0.001 gas.</p>
              </div>
              <div>
                <div className="text-accent font-medium mb-1">3. Receive</div>
                <p className="text-muted">Payment verified, upstream API called, response returned.</p>
              </div>
            </div>
          </div>
        </main>

        {/* Sidebar — Use with t2000 */}
        <aside className="lg:w-[340px] shrink-0 mt-10 lg:mt-0">
          <div className="border border-border rounded-lg bg-surface/40 sticky top-6">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-medium text-foreground">Use with t2000</h2>
            </div>

            {/* Install */}
            <div className="px-5 py-4 border-b border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wider text-muted">Install</span>
              </div>
              <pre className="text-xs text-foreground bg-panel border border-border rounded p-3 overflow-x-auto">
                <code>npm i -g @t2000/cli && t2000 init</code>
              </pre>
            </div>

            {/* CLI */}
            <div className="px-5 py-4 border-b border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wider text-muted">CLI</span>
                <CopyButton text={cliSnippet} />
              </div>
              <pre className="text-[11px] text-foreground bg-panel border border-border rounded p-3 overflow-x-auto whitespace-pre leading-relaxed">
                <code>
                  <span className="text-muted">$</span> {cliSnippet}
                </code>
              </pre>
            </div>

            {/* SDK */}
            <div className="px-5 py-4 border-b border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wider text-muted">SDK</span>
                <CopyButton text={sdkSnippet} />
              </div>
              <pre className="text-[11px] text-foreground bg-panel border border-border rounded p-3 overflow-x-auto whitespace-pre leading-relaxed">
                <code>{sdkSnippet}</code>
              </pre>
            </div>

            {/* MCP */}
            <div className="px-5 py-4 border-b border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wider text-muted">MCP (Claude / Cursor)</span>
              </div>
              <p className="text-[11px] text-muted mb-3 leading-relaxed">
                35 tools including <code className="text-foreground text-[10px] bg-panel px-1 py-0.5 rounded border border-border">t2000_services</code> and <code className="text-foreground text-[10px] bg-panel px-1 py-0.5 rounded border border-border">t2000_pay</code>. Just ask naturally:
              </p>
              <div className="space-y-2">
                {[
                  '"Search the web for Sui news"',
                  '"Generate an image of a sunset"',
                  '"Buy a $20 Netflix gift card"',
                  '"Send a postcard to 123 Main St"',
                  '"What\'s the weather in Tokyo?"',
                ].map((q) => (
                  <div key={q} className="text-[11px] text-foreground/70 bg-panel border border-border rounded px-3 py-1.5">
                    {q}
                  </div>
                ))}
              </div>
            </div>

            {/* Links */}
            <div className="px-5 py-4 space-y-2">
              <a
                href="/llms.txt"
                className="flex items-center gap-2 text-xs text-muted hover:text-foreground transition-colors"
              >
                <span className="text-accent">→</span>
                llms.txt
                <span className="text-[10px] text-dim ml-auto">agent discovery</span>
              </a>
              <a
                href="https://t2000.ai/docs#mpp"
                className="flex items-center gap-2 text-xs text-muted hover:text-foreground transition-colors"
              >
                <span className="text-accent">→</span>
                Documentation
              </a>
              <a
                href="https://t2000.ai/mpp"
                className="flex items-center gap-2 text-xs text-muted hover:text-foreground transition-colors"
              >
                <span className="text-accent">→</span>
                MPP on Sui
              </a>
              <a
                href="https://www.npmjs.com/package/@t2000/cli"
                className="flex items-center gap-2 text-xs text-muted hover:text-foreground transition-colors"
              >
                <span className="text-accent">→</span>
                @t2000/cli
                <span className="text-[10px] text-dim ml-auto">npm</span>
              </a>
              <a
                href="https://www.npmjs.com/package/@t2000/mpp-sui"
                className="flex items-center gap-2 text-xs text-muted hover:text-foreground transition-colors"
              >
                <span className="text-accent">→</span>
                @t2000/mpp-sui
                <span className="text-[10px] text-dim ml-auto">npm</span>
              </a>
              <a
                href="https://github.com/mission69b/t2000"
                className="flex items-center gap-2 text-xs text-muted hover:text-foreground transition-colors"
              >
                <span className="text-accent">→</span>
                GitHub
              </a>
              <a
                href="https://mpp.dev"
                className="flex items-center gap-2 text-xs text-muted hover:text-foreground transition-colors"
              >
                <span className="text-accent">→</span>
                MPP Standard
                <span className="text-[10px] text-dim ml-auto">mpp.dev</span>
              </a>
            </div>
          </div>
        </aside>
      </div>

      {/* Footer */}
      <footer className="border-t border-border mt-16">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between text-xs text-muted">
          <span>t2000 — Sui USDC</span>
          <span>
            Powered by{' '}
            <a href="https://mpp.dev" className="text-accent hover:underline">
              MPP
            </a>{' '}
            +{' '}
            <a href="https://sui.io" className="text-accent hover:underline">
              Sui
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
