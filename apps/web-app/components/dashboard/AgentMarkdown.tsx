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
  [/^send/i, 'send'],
  [/^borrow/i, 'borrow'],
  [/^claim/i, 'claim-rewards'],
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
  const regex = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\[([A-Za-z][^\]]*)\])/g;
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

interface StatData {
  label: string;
  value: string;
  status: 'safe' | 'warning' | 'danger' | 'neutral';
}



interface PostcardData {
  to: string;
  message: string;
  delivery: string;
  tracking: string;
  front?: string;
  back?: string;
}

type LineData =
  | { type: 'paragraph'; segments: Segment[] }
  | { type: 'heading'; level: number; segments: Segment[] }
  | { type: 'list-item'; number: number; segments: Segment[] }
  | { type: 'bullet-item'; segments: Segment[] }
  | { type: 'stat'; data: StatData }
  | { type: 'postcard'; data: PostcardData }
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

    const pcMatch = trimmed.match(/^<<postcard\s+to="([^"]+)"\s+message="([^"]+)"\s+delivery="([^"]+)"\s+tracking="([^"]*)"(?:\s+front="([^"]*)")?(?:\s+back="([^"]*)")?\s*>>$/);
    if (pcMatch) {
      result.push({
        type: 'postcard',
        data: { to: pcMatch[1], message: pcMatch[2], delivery: pcMatch[3], tracking: pcMatch[4], front: pcMatch[5], back: pcMatch[6] },
      });
      continue;
    }

    const statMatch = trimmed.match(/^<<stat\s+label="([^"]+)"\s+value="([^"]+)"(?:\s+status="(safe|warning|danger|neutral)")?\s*>>$/);
    if (statMatch) {
      result.push({
        type: 'stat',
        data: { label: statMatch[1], value: statMatch[2], status: (statMatch[3] as StatData['status']) ?? 'neutral' },
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
              <code key={i} className="bg-surface border border-border rounded px-1.5 py-0.5 text-xs font-mono text-foreground">
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
                className="text-info underline underline-offset-2 hover:opacity-70 transition"
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
                  className="inline-flex items-center rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs font-medium text-foreground hover:bg-border/50 hover:border-border-bright transition active:scale-[0.97] mx-0.5 align-baseline"
                >
                  {seg.label}
                </button>
              );
            }
            return (
              <span key={i} className="font-medium text-foreground">
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

const STATUS_COLORS: Record<StatData['status'], string> = {
  safe: 'text-success',
  warning: 'text-warning',
  danger: 'text-error',
  neutral: 'text-foreground',
};

const STATUS_DOT: Record<StatData['status'], string> = {
  safe: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-error',
  neutral: 'bg-border-bright',
};

function StatGrid({ stats }: { stats: StatData[] }) {
  return (
    <div className="my-2 grid grid-cols-2 gap-1.5">
      {stats.map((s, i) => (
        <div key={i} className="rounded-xl bg-surface border border-border px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <div className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[s.status]}`} />
            <span className="text-[10px] uppercase tracking-wider text-muted font-medium">{s.label}</span>
          </div>
          <div className={`text-sm font-semibold ${STATUS_COLORS[s.status]}`}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}

function PostcardVisual({ data }: { data: PostcardData }) {
  return (
    <div className="my-2 rounded-2xl overflow-hidden border border-info/20 bg-info/5">
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-info/60 font-medium">Postcard Sent</div>
            <div className="text-sm font-semibold text-foreground mt-0.5">To: {data.to}</div>
          </div>
          <div className="text-2xl">📬</div>
        </div>
        <p className="text-xs text-muted mt-2 italic leading-relaxed">&ldquo;{data.message}&rdquo;</p>
      </div>

      {(data.front || data.back) && (
        <div className="px-4 pb-2 flex gap-2">
          {data.front && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.front} alt="Postcard front" className="w-1/2 rounded-lg border border-border" />
          )}
          {data.back && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.back} alt="Postcard back" className="w-1/2 rounded-lg border border-border" />
          )}
        </div>
      )}

      <div className="px-4 pb-4 flex items-center justify-between text-xs text-muted">
        <span>Est. delivery: <span className="text-foreground font-medium">{data.delivery}</span></span>
        {data.tracking && <span className="font-mono text-[11px]">{data.tracking}</span>}
      </div>
    </div>
  );
}

export function AgentMarkdown({ text, onAction }: AgentMarkdownProps) {
  const lines = parseLines(text);

  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.type === 'stat') {
      const stats: StatData[] = [];
      while (i < lines.length && lines[i].type === 'stat') {
        stats.push((lines[i] as { type: 'stat'; data: StatData }).data);
        i++;
      }
      elements.push(<StatGrid key={`stat-${i}`} stats={stats} />);
      continue;
    }

    if (line.type === 'spacer') {
      elements.push(<div key={i} className="h-1" />);
    } else if (line.type === 'postcard') {
      elements.push(<PostcardVisual key={i} data={line.data} />);
    } else if (line.type === 'heading') {
      const cls = line.level === 1
        ? 'font-semibold text-foreground text-sm mt-2 first:mt-0'
        : 'font-semibold text-foreground text-[13px] mt-2 first:mt-0';
      elements.push(
        <p key={i} className={cls}>
          <InlineSegments segments={line.segments} onAction={onAction} />
        </p>,
      );
    } else if (line.type === 'list-item') {
      elements.push(
        <div key={i} className="flex gap-2 pl-0.5">
          <span className="text-dim font-mono text-xs leading-relaxed shrink-0 w-4 text-right">
            {line.number}.
          </span>
          <span>
            <InlineSegments segments={line.segments} onAction={onAction} />
          </span>
        </div>,
      );
    } else if (line.type === 'bullet-item') {
      elements.push(
        <div key={i} className="flex gap-2 pl-0.5">
          <span className="text-dim leading-relaxed shrink-0 w-4 text-center">
            •
          </span>
          <span>
            <InlineSegments segments={line.segments} onAction={onAction} />
          </span>
        </div>,
      );
    } else {
      elements.push(
        <p key={i}>
          <InlineSegments segments={(line as { segments: Segment[] }).segments} onAction={onAction} />
        </p>,
      );
    }
    i++;
  }

  return (
    <div className="space-y-1 text-foreground/85 leading-relaxed">
      {elements}
    </div>
  );
}
