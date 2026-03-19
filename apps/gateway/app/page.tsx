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
          <p className="text-xs text-muted truncate">{service.description}</p>
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
          <div className="mt-3 flex items-center gap-2 text-[11px] text-muted">
            <span>Base URL:</span>
            <code className="bg-panel border border-border px-2 py-0.5 rounded text-foreground">
              {service.serviceUrl}
            </code>
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
            <span className="text-muted">mpp gateway</span>
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
              MPP Gateway
              <span className="text-accent ml-2 text-sm font-normal">Sui USDC</span>
            </h1>
            <p className="text-sm text-muted max-w-xl">
              Pay-per-request AI and web APIs. No API keys. No accounts.
              Agents pay with Sui USDC via the{' '}
              <a href="https://mpp.dev" className="text-accent hover:underline">
                Machine Payments Protocol
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

          {/* Payment info */}
          <div className="mt-8 p-5 border border-border rounded-lg bg-surface/40">
            <h3 className="text-sm font-medium text-foreground mb-3">How it works</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <div className="text-accent font-medium mb-1">1. Call the endpoint</div>
                <p className="text-muted">
                  Send a request to any endpoint above. You&apos;ll receive a 402 with a payment challenge.
                </p>
              </div>
              <div>
                <div className="text-accent font-medium mb-1">2. Pay with USDC</div>
                <p className="text-muted">
                  Your agent signs a USDC transfer on Sui. Settlement in ~400ms, gas under $0.001.
                </p>
              </div>
              <div>
                <div className="text-accent font-medium mb-1">3. Get the response</div>
                <p className="text-muted">
                  The gateway verifies payment, proxies to the upstream API, and returns the result.
                </p>
              </div>
            </div>
          </div>
        </main>

        {/* Sidebar — Use with t2000 */}
        <aside className="lg:w-[340px] shrink-0 mt-10 lg:mt-0">
          <div className="border border-border rounded-lg bg-surface/40 sticky top-6">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-medium text-foreground">Use with t2000</h2>
              <p className="text-[11px] text-muted mt-1">
                Install the CLI and fund your agent&apos;s Sui wallet.
              </p>
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
                href="https://t2000.ai/docs"
                className="flex items-center gap-2 text-xs text-muted hover:text-foreground transition-colors"
              >
                <span className="text-accent">→</span>
                Documentation
              </a>
              <a
                href="https://www.npmjs.com/package/@t2000/mpp-sui"
                className="flex items-center gap-2 text-xs text-muted hover:text-foreground transition-colors"
              >
                <span className="text-accent">→</span>
                npm install @t2000/mpp-sui
              </a>
              <a
                href="https://t2000.ai/mpp"
                className="flex items-center gap-2 text-xs text-muted hover:text-foreground transition-colors"
              >
                <span className="text-accent">→</span>
                What is MPP?
              </a>
            </div>
          </div>
        </aside>
      </div>

      {/* Footer */}
      <footer className="border-t border-border mt-16">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between text-xs text-muted">
          <span>t2000 MPP Gateway — Sui USDC</span>
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
