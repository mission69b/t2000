'use client';

import React from 'react';

interface AgentMarkdownProps {
  text: string;
  onAction?: (flow: string) => void;
}

const ACTION_FLOW_MAP: [RegExp, string][] = [
  [/^save/i, 'save'],
  [/^repay/i, 'repay'],
  [/^withdraw/i, 'withdraw'],
  [/^invest/i, 'invest'],
  [/^send/i, 'send'],
  [/^borrow/i, 'borrow'],
  [/^swap/i, 'swap'],
  [/^buy/i, 'swap'],
  [/^sell/i, 'swap'],
  [/^claim/i, 'claim-rewards'],
  [/^rebalance/i, 'rebalance'],
  [/^switch to/i, 'rebalance'],
  [/^check rate/i, 'report'],
  [/^view/i, 'report'],
];

export function resolveFlow(label: string): string | null {
  for (const [pattern, flow] of ACTION_FLOW_MAP) {
    if (pattern.test(label)) return flow;
  }
  return null;
}

type Segment =
  | { type: 'text'; content: string }
  | { type: 'bold'; content: string }
  | { type: 'code'; content: string }
  | { type: 'link'; text: string; url: string }
  | { type: 'action'; label: string };

function parseInline(text: string): Segment[] {
  const segments: Segment[] = [];
  const regex = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\[([A-Z][^\]]*)\])/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    if (match[2]) {
      segments.push({ type: 'bold', content: match[2] });
    } else if (match[3]) {
      segments.push({ type: 'code', content: match[3] });
    } else if (match[4] && match[5]) {
      segments.push({ type: 'link', text: match[4], url: match[5] });
    } else if (match[6]) {
      segments.push({ type: 'action', label: match[6] });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return segments;
}

interface GiftCardData {
  brand: string;
  amount: string;
  code: string;
  url: string;
}

type LineData =
  | { type: 'paragraph'; segments: Segment[] }
  | { type: 'heading'; level: number; segments: Segment[] }
  | { type: 'list-item'; number: number; segments: Segment[] }
  | { type: 'bullet-item'; segments: Segment[] }
  | { type: 'giftcard'; data: GiftCardData }
  | { type: 'spacer' };

function parseLines(text: string): LineData[] {
  const rawLines = text.split('\n');
  const result: LineData[] = [];

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (result.length > 0 && result[result.length - 1].type !== 'spacer') {
        result.push({ type: 'spacer' });
      }
      continue;
    }

    const gcMatch = trimmed.match(/^<<giftcard\s+brand="([^"]+)"\s+amount="([^"]+)"\s+code="([^"]+)"\s+url="([^"]+)">>$/);
    if (gcMatch) {
      result.push({
        type: 'giftcard',
        data: { brand: gcMatch[1], amount: gcMatch[2], code: gcMatch[3], url: gcMatch[4] },
      });
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      result.push({
        type: 'heading',
        level: headingMatch[1].length,
        segments: parseInline(headingMatch[2]),
      });
      continue;
    }

    const numMatch = trimmed.match(/^(\d+)[.)]\s+(.+)/);
    if (numMatch) {
      result.push({
        type: 'list-item',
        number: parseInt(numMatch[1]),
        segments: parseInline(numMatch[2]),
      });
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*•]\s+(.+)/);
    if (bulletMatch) {
      result.push({
        type: 'bullet-item',
        segments: parseInline(bulletMatch[1]),
      });
      continue;
    }

    result.push({
      type: 'paragraph',
      segments: parseInline(trimmed),
    });
  }

  return result;
}

function InlineSegments({
  segments,
  onAction,
}: {
  segments: Segment[];
  onAction?: (flow: string) => void;
}) {
  return (
    <>
      {segments.map((seg, i) => {
        switch (seg.type) {
          case 'bold':
            return (
              <strong key={i} className="font-semibold text-foreground">
                {seg.content}
              </strong>
            );
          case 'code':
            return (
              <code key={i} className="bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-xs font-mono text-accent">
                {seg.content}
              </code>
            );
          case 'link':
            return (
              <a
                key={i}
                href={seg.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline underline-offset-2 hover:text-accent/80 transition"
              >
                {seg.text}
              </a>
            );
          case 'action': {
            const flow = resolveFlow(seg.label);
            if (flow && onAction) {
              return (
                <button
                  key={i}
                  onClick={() => onAction(seg.label)}
                  className="inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent hover:bg-accent/20 hover:border-accent/50 transition active:scale-[0.97] mx-0.5 align-baseline"
                >
                  {seg.label}
                </button>
              );
            }
            return (
              <span key={i} className="font-medium text-accent">
                {seg.label}
              </span>
            );
          }
          default:
            return <span key={i}>{seg.content}</span>;
        }
      })}
    </>
  );
}

function GiftCardVisual({ data }: { data: GiftCardData }) {
  const [copied, setCopied] = React.useState(false);

  const copyCode = () => {
    navigator.clipboard.writeText(data.code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2 rounded-2xl overflow-hidden border border-accent/20 bg-gradient-to-br from-accent/10 via-surface to-accent/5">
      <div className="px-4 pt-4 pb-2 flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-accent/60 font-medium">Gift Card</div>
          <div className="text-sm font-semibold text-foreground mt-0.5">{data.brand}</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-accent">{data.amount}</div>
        </div>
      </div>

      <div className="px-4 pb-3">
        <button
          onClick={copyCode}
          className="w-full flex items-center justify-between rounded-lg bg-white/5 border border-white/10 px-3 py-2 hover:bg-white/10 transition group"
        >
          <code className="font-mono text-sm text-foreground tracking-wide">{data.code}</code>
          <span className="text-xs text-muted group-hover:text-accent transition ml-2 shrink-0">
            {copied ? '✓ Copied' : 'Copy'}
          </span>
        </button>
      </div>

      <a
        href={data.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 bg-accent text-black font-semibold text-sm py-3 hover:brightness-110 transition active:scale-[0.99]"
      >
        Redeem Now →
      </a>
    </div>
  );
}

export function AgentMarkdown({ text, onAction }: AgentMarkdownProps) {
  const lines = parseLines(text);

  return (
    <div className="space-y-1 text-foreground/85 leading-relaxed">
      {lines.map((line, i) => {
        if (line.type === 'spacer') {
          return <div key={i} className="h-1" />;
        }

        if (line.type === 'giftcard') {
          return <GiftCardVisual key={i} data={line.data} />;
        }

        if (line.type === 'heading') {
          const cls = line.level === 1
            ? 'font-semibold text-foreground text-sm mt-2 first:mt-0'
            : 'font-semibold text-foreground text-[13px] mt-2 first:mt-0';
          return (
            <p key={i} className={cls}>
              <InlineSegments segments={line.segments} onAction={onAction} />
            </p>
          );
        }

        if (line.type === 'list-item') {
          return (
            <div key={i} className="flex gap-2 pl-0.5">
              <span className="text-accent/60 font-mono text-xs leading-relaxed shrink-0 w-4 text-right">
                {line.number}.
              </span>
              <span>
                <InlineSegments segments={line.segments} onAction={onAction} />
              </span>
            </div>
          );
        }

        if (line.type === 'bullet-item') {
          return (
            <div key={i} className="flex gap-2 pl-0.5">
              <span className="text-accent/60 leading-relaxed shrink-0 w-4 text-center">
                •
              </span>
              <span>
                <InlineSegments segments={line.segments} onAction={onAction} />
              </span>
            </div>
          );
        }

        return (
          <p key={i}>
            <InlineSegments segments={line.segments} onAction={onAction} />
          </p>
        );
      })}
    </div>
  );
}
