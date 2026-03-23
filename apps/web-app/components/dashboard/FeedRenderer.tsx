'use client';

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
    <div className="space-y-3">
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
        <div className="flex justify-end">
          <div className="max-w-[80%] rounded-2xl rounded-br-md bg-white px-4 py-2.5 text-sm text-neutral-950">
            {data.text}
          </div>
        </div>
      );

    case 'ai-text':
      return (
        <div className="space-y-2">
          <div className="rounded-2xl rounded-bl-md bg-neutral-900 px-4 py-3 text-sm">
            <span className="text-neutral-500 mr-1.5">🤖</span>
            <span className="whitespace-pre-line">{data.text}</span>
          </div>
          {data.chips && data.chips.length > 0 && (
            <div className="flex flex-wrap gap-2 pl-2">
              {data.chips.map((chip) => (
                <button
                  key={chip.label}
                  onClick={() => onChipClick(chip.flow)}
                  className="rounded-full bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-700 hover:text-white transition"
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
        <div className="rounded-xl bg-neutral-900 p-4 space-y-3">
          <p className="text-sm font-medium">{data.title}</p>
          {data.qr && data.code && (
            <div className="flex justify-center py-2">
              <QrCode value={data.code} size={180} />
            </div>
          )}
          {data.meta.map((m) => (
            <div key={m.label} className="flex justify-between text-sm">
              <span className="text-neutral-500">{m.label}</span>
              <span>{m.value}</span>
            </div>
          ))}
          {data.code && (
            <div className="flex items-center justify-between bg-neutral-800 rounded-lg px-3 py-2">
              <code className="text-xs font-mono text-white break-all">{data.code}</code>
              <button
                onClick={() => onCopy?.(data.code!)}
                className="text-neutral-500 hover:text-white p-1 shrink-0 ml-2"
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
        <div className="rounded-xl bg-neutral-900 p-4 space-y-2">
          <p className="text-sm font-medium">{data.title}</p>
          <div className="divide-y divide-neutral-800">
            {data.items.map((row, i) => (
              <div key={i} className="flex justify-between py-2 text-sm">
                <div>
                  <span>{row.label}</span>
                  {row.sub && <span className="ml-2 text-neutral-500">{row.sub}</span>}
                </div>
                <span className="text-neutral-400">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      );

    case 'report':
      return (
        <div className="rounded-xl bg-neutral-900 p-4 space-y-4">
          {data.sections.map((section, i) => (
            <div key={i} className="space-y-1">
              <p className="text-sm font-medium">{section.title}</p>
              {section.lines.map((line, j) => (
                <p key={j} className="text-sm text-neutral-400">{line}</p>
              ))}
            </div>
          ))}
        </div>
      );

    case 'image':
      return (
        <div className="rounded-xl bg-neutral-900 overflow-hidden space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.url} alt={data.alt} className="w-full" />
          {data.cost && (
            <p className="text-xs text-neutral-500 px-4 pb-3">{data.cost} from your balance</p>
          )}
        </div>
      );

    case 'confirmation':
      return (
        <div className="rounded-xl bg-neutral-900 p-4 space-y-3">
          <p className="text-sm font-medium">{data.title}</p>
          {data.details.map((d) => (
            <div key={d.label} className="flex justify-between text-sm">
              <span className="text-neutral-500">{d.label}</span>
              <span>{d.value}</span>
            </div>
          ))}
        </div>
      );

    case 'result':
      return (
        <div className={`rounded-xl p-4 text-sm ${data.success ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
          <p className="font-medium">
            <span className="mr-1.5">{data.success ? '✓' : '✕'}</span>
            {data.title}
          </p>
          {data.details && (
            <p className={`mt-1 ${data.success ? 'text-green-300/80' : 'text-red-300/80'}`}>{data.details}</p>
          )}
        </div>
      );

    case 'audio':
      return (
        <div className="rounded-xl bg-neutral-900 p-4 space-y-2">
          <p className="text-sm font-medium">{data.title}</p>
          <audio controls className="w-full" src={data.url} />
          <div className="flex items-center justify-between">
            {data.cost && (
              <p className="text-xs text-neutral-500">{data.cost} from your balance</p>
            )}
            <a
              href={data.url}
              download
              className="text-xs text-neutral-500 hover:text-white transition"
            >
              Download
            </a>
          </div>
        </div>
      );

    case 'error':
      return (
        <div className="space-y-2">
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm">
            <span className="text-neutral-500 mr-1.5">🤖</span>
            <span className="text-red-300">{data.message}</span>
          </div>
          {data.chips && data.chips.length > 0 && (
            <div className="flex flex-wrap gap-2 pl-2">
              {data.chips.map((chip) => (
                <button
                  key={chip.label}
                  onClick={() => onChipClick(chip.flow)}
                  className="rounded-full bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-700 hover:text-white transition"
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

    default:
      return null;
  }
}
