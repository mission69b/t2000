'use client';

import { useState, useMemo } from 'react';
import { services, type Service } from '@/lib/services';
import { Header } from '../components/Header';
import { CodeBlock } from '../components/CodeBlock';

const METHOD_COLORS: Record<string, string> = {
  POST: 'bg-blue-500/15 text-blue-400',
  GET: 'bg-green-500/15 text-green-400',
};

const ALL_CATEGORIES = Array.from(
  new Set(services.flatMap((s) => s.categories)),
).sort();

const CATEGORY_LABELS: Record<string, string> = {
  ai: 'AI & LLMs',
  media: 'Media',
  search: 'Search',
  web: 'Web',
  data: 'Data',
  compute: 'Compute',
  commerce: 'Commerce',
  communication: 'Comms',
  translation: 'Translation',
  messaging: 'Messaging',
  security: 'Security',
  finance: 'Finance',
  utility: 'Utility',
};

function getPriceRange(service: Service): string {
  const prices = service.endpoints
    .map((e) => e.price)
    .filter((p) => p !== 'dynamic')
    .map(Number);
  if (prices.length === 0) return 'dynamic';
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return `$${min}`;
  return `$${min}\u2013$${max}`;
}

function SearchIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function ListIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-4 h-4 ${active ? 'text-accent' : 'text-muted'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function GridIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-4 h-4 ${active ? 'text-accent' : 'text-muted'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
    </svg>
  );
}

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
          <div className="flex items-center gap-3 mb-1 flex-wrap">
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
          <ServiceUrlCopy url={service.serviceUrl} />
        </div>
        <div className="text-xs text-muted font-mono shrink-0 hidden sm:block">
          {service.endpoints.length} endpoint{service.endpoints.length > 1 ? 's' : ''}
        </div>
        <svg
          className={`w-4 h-4 text-muted transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`}
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

function ServiceCard({ service, isOpen, onToggle }: {
  service: Service;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`border border-border rounded-lg bg-surface/40 transition-all hover:border-border-bright ${isOpen ? 'ring-1 ring-accent/20' : ''}`}
    >
      <button
        onClick={onToggle}
        className="w-full text-left p-5 cursor-pointer"
      >
        <div className="flex items-start gap-3 mb-3">
          <img
            src={service.logo}
            alt={service.name}
            className="w-7 h-7 shrink-0 opacity-70 mt-0.5"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
          <div className="flex-1 min-w-0">
            <div className="text-foreground font-medium mb-1">{service.name}</div>
            <div className="flex gap-1.5 flex-wrap">
              {service.categories.map((c) => (
                <span
                  key={c}
                  className="text-[9px] uppercase tracking-wider text-muted bg-panel px-1.5 py-0.5 rounded"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>
        <p className="text-[11px] text-muted leading-relaxed mb-2">{service.description}</p>
        <ServiceUrlCopy url={service.serviceUrl} />
        <div className="flex items-center justify-between text-[11px] mt-3">
          <span className="text-dim font-mono">{service.endpoints.length} endpoint{service.endpoints.length > 1 ? 's' : ''}</span>
          <span className="text-accent font-medium">{getPriceRange(service)}</span>
        </div>
      </button>

      {isOpen && (
        <div className="px-5 pb-5 border-t border-border pt-4">
          <div className="space-y-2">
            {service.endpoints.map((ep) => (
              <div key={ep.path} className="flex items-center gap-2 text-[11px]">
                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0 ${METHOD_COLORS[ep.method] ?? ''}`}>
                  {ep.method}
                </span>
                <code className="text-foreground font-mono truncate flex-1">{ep.path}</code>
                <span className="text-accent font-medium shrink-0">${ep.price}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ServiceUrlCopy({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation();
          navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      }}
      className="inline-flex items-center gap-1.5 text-[11px] text-dim font-mono hover:text-accent transition-colors cursor-pointer group"
      title="Copy full URL"
    >
      {url}
      <span className={`text-[9px] transition-colors ${copied ? 'text-accent' : 'text-transparent group-hover:text-muted'}`}>
        {copied ? '✓' : 'copy'}
      </span>
    </span>
  );
}

export default function GatewayPage() {
  const [openServices, setOpenServices] = useState<Set<string>>(new Set(['openai']));
  const [search, setSearch] = useState('');
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'list' | 'card'>('list');

  const toggleService = (id: string) => {
    setOpenServices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCategory = (cat: string) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const clearFilters = () => {
    setSearch('');
    setActiveCategories(new Set());
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return services.filter((svc) => {
      if (activeCategories.size > 0 && !svc.categories.some((c) => activeCategories.has(c))) {
        return false;
      }
      if (!q) return true;
      return (
        svc.name.toLowerCase().includes(q) ||
        svc.description.toLowerCase().includes(q) ||
        svc.id.includes(q) ||
        svc.endpoints.some((ep) => ep.path.toLowerCase().includes(q) || ep.description.toLowerCase().includes(q))
      );
    });
  }, [search, activeCategories]);

  const isFiltered = search.length > 0 || activeCategories.size > 0;
  const totalEndpoints = services.reduce((sum, s) => sum + s.endpoints.length, 0);

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
      <Header />

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
          <div className="flex gap-6 mb-6 text-xs">
            <div>
              <span className="text-muted">Services</span>
              <span className="ml-2 text-foreground font-medium">{services.length}</span>
            </div>
            <div>
              <span className="text-muted">Endpoints</span>
              <span className="ml-2 text-foreground font-medium">{totalEndpoints}</span>
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

          {/* Search + View Toggle */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <SearchIcon />
              </div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search services, endpoints, descriptions..."
                className="w-full bg-surface/60 border border-border rounded-lg text-xs text-foreground placeholder:text-dim px-3 py-2.5 pl-9 outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="flex items-center border border-border rounded-lg overflow-hidden shrink-0">
              <button
                onClick={() => setView('list')}
                className={`p-2 transition-colors cursor-pointer ${view === 'list' ? 'bg-accent-dim' : 'hover:bg-surface/60'}`}
                title="List view"
              >
                <ListIcon active={view === 'list'} />
              </button>
              <button
                onClick={() => setView('card')}
                className={`p-2 transition-colors cursor-pointer border-l border-border ${view === 'card' ? 'bg-accent-dim' : 'hover:bg-surface/60'}`}
                title="Card view"
              >
                <GridIcon active={view === 'card'} />
              </button>
            </div>
          </div>

          {/* Category pills */}
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            {ALL_CATEGORIES.map((cat) => {
              const isActive = activeCategories.has(cat);
              const count = services.filter((s) => s.categories.includes(cat)).length;
              return (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full border transition-all cursor-pointer ${
                    isActive
                      ? 'border-accent/40 bg-accent-dim text-accent'
                      : 'border-border text-muted hover:border-border-bright hover:text-foreground'
                  }`}
                >
                  {CATEGORY_LABELS[cat] ?? cat}
                  <span className="ml-1.5 opacity-60">{count}</span>
                </button>
              );
            })}
            {isFiltered && (
              <button
                onClick={clearFilters}
                className="text-[10px] text-muted hover:text-foreground transition-colors ml-1 cursor-pointer"
              >
                clear
              </button>
            )}
          </div>

          {/* Result count */}
          {isFiltered && (
            <div className="text-[11px] text-muted mb-4">
              Showing <span className="text-foreground font-medium">{filtered.length}</span> of {services.length} services
              {filtered.length === 0 && (
                <span className="ml-2 text-dim">&mdash; try a different search or category</span>
              )}
            </div>
          )}

          {/* Service List View */}
          {view === 'list' && (
            <div className="border border-border rounded-lg overflow-hidden bg-surface/40">
              {filtered.length > 0 ? (
                filtered.map((svc) => (
                  <ServiceRow
                    key={svc.id}
                    service={svc}
                    isOpen={openServices.has(svc.id)}
                    onToggle={() => toggleService(svc.id)}
                  />
                ))
              ) : (
                <div className="px-5 py-12 text-center text-muted text-xs">
                  No services match your filters.
                </div>
              )}
            </div>
          )}

          {/* Service Card View */}
          {view === 'card' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.length > 0 ? (
                filtered.map((svc) => (
                  <ServiceCard
                    key={svc.id}
                    service={svc}
                    isOpen={openServices.has(svc.id)}
                    onToggle={() => toggleService(svc.id)}
                  />
                ))
              ) : (
                <div className="col-span-full px-5 py-12 text-center text-muted text-xs border border-border rounded-lg">
                  No services match your filters.
                </div>
              )}
            </div>
          )}

        </main>

        {/* Sidebar — Use with t2000 */}
        <aside className="lg:w-[340px] shrink-0 mt-10 lg:mt-0">
          <div className="border border-border rounded-lg bg-surface/40 sticky top-6">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-medium text-foreground">Use with t2000</h2>
            </div>

            {/* Install */}
            <div className="px-5 py-4 border-b border-border">
              <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Install</div>
              <CodeBlock code="npm i -g @t2000/cli && t2000 init" lang="bash" />
            </div>

            {/* CLI */}
            <div className="px-5 py-4 border-b border-border">
              <div className="text-[10px] uppercase tracking-wider text-muted mb-2">CLI</div>
              <CodeBlock code={`$ ${cliSnippet}`} lang="bash" />
            </div>

            {/* SDK */}
            <div className="px-5 py-4 border-b border-border">
              <div className="text-[10px] uppercase tracking-wider text-muted mb-2">SDK</div>
              <CodeBlock code={sdkSnippet} lang="typescript" />
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
                  '"Use t2000 to get the latest headlines"',
                  '"Use t2000 to generate a sunset image"',
                  '"Use t2000 to buy a Netflix gift card"',
                  '"Use t2000 to mail a postcard to NYC"',
                  '"Use t2000 to check weather in Tokyo"',
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
                <span className="text-accent">&rarr;</span>
                llms.txt
                <span className="text-[10px] text-dim ml-auto">agent discovery</span>
              </a>
              <a
                href="https://t2000.ai/docs#mpp"
                className="flex items-center gap-2 text-xs text-muted hover:text-foreground transition-colors"
              >
                <span className="text-accent">&rarr;</span>
                Documentation
              </a>
              <a
                href="https://github.com/mission69b/t2000"
                className="flex items-center gap-2 text-xs text-muted hover:text-foreground transition-colors"
              >
                <span className="text-accent">&rarr;</span>
                GitHub
              </a>
              <a
                href="https://discord.gg/qE95FPt6Z5"
                className="flex items-center gap-2 text-xs text-muted hover:text-foreground transition-colors"
              >
                <span className="text-accent">&rarr;</span>
                Discord
              </a>
            </div>
          </div>
        </aside>
      </div>

      {/* Footer */}
      <footer className="border-t border-border mt-16">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between text-xs text-muted">
          <span>t2000</span>
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
