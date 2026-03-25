'use client';

import React from 'react';
import type { FeedItem } from '@/lib/feed-types';
import { QrCode } from './QrCode';
import { ContactToast } from './ContactToast';

interface FeedRendererProps {
  items: FeedItem[];
  onChipClick: (flow: string) => void;
  onCopy?: (text: string) => void;
  onSaveContact?: (name: string, address: string) => void;
}

export function FeedRenderer({ items, onChipClick, onCopy, onSaveContact }: FeedRendererProps) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-3" role="log" aria-label="Conversation" aria-live="polite">
      {items.map((item) => (
        <FeedItemCard
          key={item.id}
          item={item}
          onChipClick={onChipClick}
          onCopy={onCopy}
          onSaveContact={onSaveContact}
        />
      ))}
    </div>
  );
}

function FeedItemCard({
  item,
  onChipClick,
  onCopy,
  onSaveContact,
}: {
  item: FeedItem;
  onChipClick: (flow: string) => void;
  onCopy?: (text: string) => void;
  onSaveContact?: (name: string, address: string) => void;
}) {
  const { data } = item;

  switch (data.type) {
    case 'user-message':
      return (
        <div className="flex justify-end feed-row">
          <div className="max-w-[80%] rounded-2xl rounded-br-md bg-accent/15 border border-accent/20 px-4 py-2.5 text-sm text-foreground">
            {data.text}
          </div>
        </div>
      );

    case 'ai-text':
      return (
        <div className="space-y-2 feed-row">
          <div className="rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-3 text-sm">
            <span className="text-muted mr-1.5">t2</span>
            <span className="whitespace-pre-line text-foreground">{data.text}</span>
          </div>
          {data.chips && data.chips.length > 0 && (
            <div className="flex flex-wrap gap-2 pl-2">
              {data.chips.map((chip) => (
                <button
                  key={chip.label}
                  onClick={() => onChipClick(chip.flow)}
                  className="rounded-full border border-border bg-panel px-3 py-1.5 text-xs font-medium text-muted hover:border-border-bright hover:text-foreground transition"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          )}
        </div>
      );

    case 'receipt':
      return (
        <div className="rounded-sm border border-border bg-surface p-4 space-y-3 feed-row">
          <p className="text-sm font-medium text-foreground">{data.title}</p>
          {data.qr && data.code && (
            <div className="flex justify-center py-2">
              <QrCode value={data.code} size={180} />
            </div>
          )}
          {data.meta.map((m) => (
            <div key={m.label} className="flex justify-between text-sm">
              <span className="text-muted">{m.label}</span>
              <span className="text-foreground font-mono">{m.value}</span>
            </div>
          ))}
          {data.code && (
            <div className="flex items-center justify-between border border-border bg-panel rounded-lg px-3 py-2">
              <code className="text-xs font-mono text-foreground break-all">{data.code}</code>
              <button
                onClick={() => onCopy?.(data.code!)}
                className="text-muted hover:text-foreground p-1 shrink-0 ml-2"
                aria-label="Copy address"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                </svg>
              </button>
            </div>
          )}
        </div>
      );

    case 'list':
      return (
        <div className="rounded-sm border border-border bg-surface p-4 space-y-2 feed-row">
          <p className="text-sm font-medium text-foreground">{data.title}</p>
          <div className="divide-y divide-border">
            {data.items.map((row, i) => (
              <div key={i} className="flex justify-between py-2 text-sm">
                <div>
                  <span className="text-foreground">{row.label}</span>
                  {row.sub && <span className="ml-2 text-muted">{row.sub}</span>}
                </div>
                <span className="text-muted font-mono">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      );

    case 'report':
      return (
        <div className="rounded-sm border border-border bg-surface p-4 space-y-4 feed-row">
          {data.sections.map((section, i) => (
            <div key={i} className="space-y-1">
              <p className="text-sm font-medium text-foreground">{section.title}</p>
              {section.lines.map((line, j) => (
                <p key={j} className="text-sm text-muted font-mono">{line}</p>
              ))}
            </div>
          ))}
        </div>
      );

    case 'image':
      return (
        <div className="rounded-sm border border-border bg-surface overflow-hidden space-y-2 feed-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.url} alt={data.alt} className="w-full" />
          {data.cost && (
            <p className="text-xs text-muted px-4 pb-3">{data.cost} from your balance</p>
          )}
        </div>
      );

    case 'confirmation':
      return (
        <div className="rounded-sm border border-border bg-surface p-4 space-y-3 feed-row">
          <p className="text-sm font-medium text-foreground">{data.title}</p>
          {data.details.map((d) => (
            <div key={d.label} className="flex justify-between text-sm">
              <span className="text-muted">{d.label}</span>
              <span className="text-foreground font-mono">{d.value}</span>
            </div>
          ))}
        </div>
      );

    case 'result':
      return (
        <div className={`rounded-sm p-4 text-sm feed-row ${data.success ? 'bg-accent-dim border border-accent/20' : 'bg-red-500/10 border border-red-500/20'}`}>
          <p className="font-medium">
            <span className="mr-1.5">{data.success ? '✓' : '✕'}</span>
            <span className={data.success ? 'text-accent' : 'text-red-400'}>{data.title}</span>
          </p>
          {data.details && (
            <p className={`mt-1 ${data.success ? 'text-accent/70' : 'text-red-300/80'}`}>{data.details}</p>
          )}
        </div>
      );

    case 'audio':
      return (
        <div className="rounded-sm border border-border bg-surface p-4 space-y-2 feed-row">
          <p className="text-sm font-medium text-foreground">{data.title}</p>
          <audio controls className="w-full" src={data.url} />
          <div className="flex items-center justify-between">
            {data.cost && (
              <p className="text-xs text-muted">{data.cost} from your balance</p>
            )}
            <a
              href={data.url}
              download
              className="text-xs text-accent hover:underline transition"
            >
              Download
            </a>
          </div>
        </div>
      );

    case 'error':
      return (
        <div className="space-y-2 feed-row">
          <div className="rounded-sm bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm">
            <span className="text-muted mr-1.5">t2</span>
            <span className="text-red-300">{data.message}</span>
          </div>
          {data.chips && data.chips.length > 0 && (
            <div className="flex flex-wrap gap-2 pl-2">
              {data.chips.map((chip) => (
                <button
                  key={chip.label}
                  onClick={() => onChipClick(chip.flow)}
                  className="rounded-full border border-border bg-panel px-3 py-1.5 text-xs font-medium text-muted hover:border-border-bright hover:text-foreground transition"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          )}
        </div>
      );

    case 'contact-prompt':
      return (
        <ContactToast
          address={data.address}
          onSave={(name) => onSaveContact?.(name, data.address)}
          onDismiss={() => {}}
        />
      );

    case 'transaction-history':
      return <TransactionHistoryCard transactions={data.transactions} network={data.network} />;

    case 'agent-response':
      return <AgentResponseCard data={data} />;

    default:
      return null;
  }
}

const TOOL_LABELS: Record<string, string> = {
  get_balance: 'Checking balance',
  get_rates: 'Checking rates',
  get_history: 'Loading history',
  get_portfolio: 'Checking portfolio',
  get_health: 'Checking health',
  web_search: 'Searching web',
  get_news: 'Fetching news',
  get_crypto_price: 'Fetching prices',
  get_stock_quote: 'Fetching quote',
  convert_currency: 'Converting currency',
  translate: 'Translating',
  send_email: 'Sending email',
  shorten_url: 'Shortening URL',
  generate_qr: 'Generating QR',
  run_code: 'Running code',
  ask_ai: 'Asking AI',
  search_flights: 'Searching flights',
  take_screenshot: 'Taking screenshot',
  security_scan: 'Scanning URL',
  generate_image: 'Generating image',
  text_to_speech: 'Converting to speech',
  send_postcard: 'Sending postcard',
  buy_gift_card: 'Buying gift card',
};

function AgentResponseCard({ data }: { data: Extract<import('@/lib/feed-types').FeedItemData, { type: 'agent-response' }> }) {
  const [costExpanded, setCostExpanded] = React.useState(false);
  const hasSteps = data.steps.length > 0;
  const isDone = data.status === 'done';
  const isError = data.status === 'error';

  return (
    <div className="rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-3 text-sm space-y-2 feed-row overflow-hidden">
      {hasSteps && (
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-muted">
          {data.steps.map((step, i) => (
            <span key={i} className="flex items-center gap-1 min-w-0">
              {step.status === 'done' && <span className="text-accent shrink-0">✓</span>}
              {step.status === 'running' && (
                <span className="h-3 w-3 shrink-0 animate-spin rounded-full border border-accent/30 border-t-accent" />
              )}
              {step.status === 'error' && <span className="text-red-400 shrink-0">✗</span>}
              <span className="truncate">{TOOL_LABELS[step.tool] ?? step.tool.replace(/_/g, ' ')}</span>
            </span>
          ))}
        </div>
      )}

      {data.status === 'running' && !data.text && (
        <div className="h-3 w-full max-w-[160px] rounded-full overflow-hidden bg-border/30">
          <div className="h-full w-full animate-shimmer bg-gradient-to-r from-transparent via-accent/20 to-transparent" />
        </div>
      )}

      {data.text && (
        <div className="min-w-0">
          <span className="text-muted mr-1.5">t2</span>
          <span className="whitespace-pre-line text-foreground break-words">{data.text}</span>
        </div>
      )}

      {isError && data.error && (
        <div className="text-red-300 text-xs break-words">{data.error}</div>
      )}

      {isDone && data.totalCost != null && data.totalCost > 0 && (
        <div className="flex justify-end">
          <button
            onClick={() => setCostExpanded(!costExpanded)}
            className="text-xs text-muted hover:text-foreground transition min-h-[32px] flex items-center gap-1 px-1"
          >
            <span className="font-mono">${data.totalCost.toFixed(3)}</span>
            <span>{costExpanded ? '▾' : '▸'}</span>
          </button>
        </div>
      )}

      {costExpanded && data.steps.filter((s) => s.cost && s.cost > 0).length > 0 && (
        <div className="border-t border-border pt-2 space-y-1.5">
          {data.steps.filter((s) => s.cost && s.cost > 0).map((step, i) => (
            <div key={i} className="flex justify-between text-xs text-muted gap-2">
              <span className="truncate">{TOOL_LABELS[step.tool] ?? step.tool}</span>
              <span className="font-mono shrink-0">${step.cost!.toFixed(3)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const ACTION_ICONS: Record<string, string> = {
  send: '↑',
  receive: '↓',
  lending: '🏦',
  swap: '⇄',
  contract: '📄',
  transaction: '📄',
};

const ACTION_LABELS: Record<string, string> = {
  send: 'Sent',
  receive: 'Received',
  lending: 'DeFi',
  swap: 'Swap',
  contract: 'Contract',
  transaction: 'Transaction',
};

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function truncAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

function TransactionHistoryCard({
  transactions,
  network,
}: {
  transactions: import('@/lib/feed-types').TxHistoryEntry[];
  network: string;
}) {
  const INITIAL_LIMIT = 5;
  const [expanded, setExpanded] = React.useState(false);
  const explorerBase = network === 'testnet'
    ? 'https://suiscan.xyz/testnet/tx'
    : 'https://suiscan.xyz/mainnet/tx';

  if (transactions.length === 0) {
    return (
      <div className="rounded-sm border border-border bg-surface p-4 feed-row">
        <p className="text-sm text-muted">No transactions found yet. Make your first save or send to see activity here.</p>
      </div>
    );
  }

  const visible = expanded ? transactions : transactions.slice(0, INITIAL_LIMIT);
  const hasMore = transactions.length > INITIAL_LIMIT;

  return (
    <div className="rounded-sm border border-border bg-surface p-4 space-y-1 feed-row">
      <p className="text-sm font-medium text-foreground mb-2">
        Recent Activity
        <span className="text-xs text-muted font-normal ml-2">{transactions.length} txns</span>
      </p>
      <div className="divide-y divide-border">
        {visible.map((tx) => {
          const icon = ACTION_ICONS[tx.action] ?? '📄';
          const label = ACTION_LABELS[tx.action] ?? tx.action;
          const isIn = tx.direction === 'in';
          const amountStr = tx.amount ? `${isIn ? '+' : '-'}$${tx.amount.toFixed(2)}` : '';

          return (
            <a
              key={tx.digest}
              href={`${explorerBase}/${tx.digest}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between py-2.5 hover:bg-panel/50 -mx-1 px-1 transition group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-base w-6 text-center shrink-0">{icon}</span>
                <div className="min-w-0">
                  <p className="text-sm text-foreground font-medium">{label}</p>
                  <p className="text-xs text-muted font-mono truncate">
                    {tx.counterparty ? truncAddr(tx.counterparty) : relativeTime(tx.timestamp)}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0 ml-3">
                {amountStr && (
                  <p className={`text-sm font-mono font-medium ${isIn ? 'text-accent' : 'text-foreground'}`}>
                    {amountStr}
                  </p>
                )}
                {tx.counterparty && (
                  <p className="text-xs text-muted">{relativeTime(tx.timestamp)}</p>
                )}
                {!tx.counterparty && tx.asset && (
                  <p className="text-xs text-muted">{tx.asset}</p>
                )}
              </div>
            </a>
          );
        })}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full pt-2 text-xs text-accent hover:text-accent/80 font-mono transition"
        >
          {expanded ? '▲ Show less' : `▼ Show all ${transactions.length} transactions`}
        </button>
      )}
    </div>
  );
}
