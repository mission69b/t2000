// `t2 reviews [sellerRef]` — receipt-bound review list + the on-chain
// score aggregates, from the terminal (S.1227). Symmetric to Connect's
// t2000_reviews and GET /v1/reviews — the API is the ONE source; this
// command displays its JSON, never a second score derivation. Read-only,
// no wallet. [Agent Marketplace]

import type { Command } from 'commander';
import { Option } from 'commander';
import { trustTierLabel, truncateAddress } from '@t2000/sdk';
import { resolveAgentRef } from '../lib/agent-ref.js';
import {
  handleError,
  isJsonMode,
  printBlank,
  printHeader,
  printInfo,
  printJson,
  printKeyValue,
  printLine,
} from '../output.js';

const DEFAULT_API_BASE = process.env.T2000_API_URL ?? 'https://api.t2000.ai/v1';

type ReviewRow = {
  jobId: string;
  buyer?: string | null;
  buyerAgent?: { agentId?: number; name?: string } | null;
  seller?: string | null;
  stars: number;
  text?: string | null;
  createdAt?: string;
};

type ReviewsPayload = {
  seller?: string;
  buyerAgent?: number;
  score?: number | null;
  count?: number;
  distinctBuyers?: number;
  sellerLevel?: number;
  effectiveSellerLevel?: number;
  activeSellerJobs?: number;
  activeCap?: number;
  scoreSource?: string;
  histogram?: number[];
  outcomes?: {
    rejectedAfterDelivery?: number;
    noDelivery?: number;
    asBuyerRejected?: number;
  };
  reviews?: ReviewRow[];
  ratings?: ReviewRow[];
};

async function getJson(url: string): Promise<ReviewsPayload> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  const body = (await res.json().catch(() => null)) as
    | (ReviewsPayload & { error?: unknown })
    | null;
  if (!res.ok) {
    const err = body?.error;
    const msg =
      typeof err === 'string'
        ? err
        : ((err as { message?: string } | undefined)?.message ??
          `Reviews request failed (${res.status}).`);
    throw new Error(msg);
  }
  return body ?? {};
}

/** `[0,0,0,1,9]` → `5★ ×9 · 4★ ×1` (non-zero buckets, highest first). */
export function formatHistogram(histogram: unknown): string {
  if (!Array.isArray(histogram) || histogram.length !== 5) {
    return '';
  }
  const parts: string[] = [];
  for (let stars = 5; stars >= 1; stars--) {
    const n = histogram[stars - 1];
    if (typeof n === 'number' && n > 0) {
      parts.push(`${stars}★ ×${n}`);
    }
  }
  return parts.join(' · ');
}

function firstLine(text: string | null | undefined, max = 80): string {
  const line = (text ?? '').split('\n')[0]?.trim() ?? '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function rowParty(row: ReviewRow): string {
  if (row.buyerAgent?.name) {
    return row.buyerAgent.agentId != null
      ? `${row.buyerAgent.name} #${row.buyerAgent.agentId}`
      : row.buyerAgent.name;
  }
  if (row.buyer) {
    return truncateAddress(row.buyer);
  }
  if (row.seller) {
    return `seller ${truncateAddress(row.seller)}`;
  }
  return '—';
}

export function registerReviews(program: Command) {
  const cmd = program
    .command('reviews')
    .argument(
      '[sellerRef]',
      'Seller to read — 0x address, #id, bare digits, or @handle',
    )
    .description(
      "A seller's receipt-bound reviews + on-chain score (stars, tier, in-flight cap). Same data as Connect t2000_reviews. Read-only — no wallet. [Agent Marketplace]",
    )
    .option(
      '--buyer-agent <id>',
      'Alternate mode: ratings a registered agent gave AS BUYER (numeric agent id)',
    )
    .option('--api <url>', `API base URL (default ${DEFAULT_API_BASE})`);
  // Wrong-flag honesty (S.1067 class): the ref is POSITIONAL — refuse the
  // plausible flag spellings with the fix instead of "unknown option".
  for (const wrong of ['--agent <ref>', '--seller <ref>', '--address <ref>']) {
    cmd.addOption(new Option(wrong).hideHelp());
  }
  cmd.action(
    async (
      sellerRef: string | undefined,
      opts: {
        buyerAgent?: string;
        api?: string;
        agent?: string;
        seller?: string;
        address?: string;
      },
    ) => {
      try {
        const wrongFlag = opts.agent ?? opts.seller ?? opts.address;
        if (wrongFlag !== undefined) {
          throw new Error(
            `The seller goes in the positional argument — t2 reviews ${wrongFlag} — or use --buyer-agent <id> for a buyer's given ratings.`,
          );
        }
        if (sellerRef && opts.buyerAgent) {
          throw new Error(
            'Pick ONE mode: a seller ref (positional) reads reviews OF that seller; --buyer-agent <id> reads ratings that agent gave as buyer.',
          );
        }
        if (!sellerRef && !opts.buyerAgent) {
          throw new Error(
            'Who? Pass a seller ref (0x / #id / @handle) — t2 reviews #16 — or --buyer-agent <id>.',
          );
        }
        const base = opts.api ?? DEFAULT_API_BASE;

        let payload: ReviewsPayload;
        let heading: string;
        if (opts.buyerAgent) {
          const id = opts.buyerAgent.replace(/^#/, '').trim();
          if (!/^[0-9]+$/.test(id)) {
            throw new Error('--buyer-agent takes the numeric agent id (e.g. 16).');
          }
          payload = await getJson(`${base}/reviews?buyerAgent=${id}`);
          heading = `Ratings given by agent #${id} (as buyer)`;
        } else {
          const ref = await resolveAgentRef(base, sellerRef as string);
          payload = await getJson(
            `${base}/reviews?seller=${encodeURIComponent(ref.address)}`,
          );
          heading = `Reviews — ${ref.name ?? truncateAddress(ref.address)}${
            ref.numericId != null ? ` #${ref.numericId}` : ''
          }`;
        }

        if (isJsonMode()) {
          printJson(payload);
          return;
        }

        const rows = payload.reviews ?? payload.ratings ?? [];
        printBlank();
        printHeader(heading);
        const count = payload.count ?? 0;
        printKeyValue(
          'Score',
          payload.score != null
            ? `★ ${Number(payload.score).toFixed(1)} · ${count} review${count === 1 ? '' : 's'}${
                payload.distinctBuyers != null
                  ? ` · ${payload.distinctBuyers} buyer${payload.distinctBuyers === 1 ? '' : 's'}`
                  : ''
              }`
            : 'no reviews yet',
        );
        if (payload.sellerLevel != null) {
          const eff = payload.effectiveSellerLevel ?? payload.sellerLevel;
          printKeyValue(
            'Tier',
            `${trustTierLabel(payload.sellerLevel as 1 | 2 | 3 | 4)}${
              eff !== payload.sellerLevel
                ? ` (effective: ${trustTierLabel(eff as 1 | 2 | 3 | 4)})`
                : ''
            }`,
          );
        }
        if (payload.activeCap != null) {
          printKeyValue(
            'In flight',
            `${payload.activeSellerJobs ?? 0}/${payload.activeCap} claimed jobs`,
          );
        }
        const hist = formatHistogram(payload.histogram);
        if (hist) {
          printKeyValue('Histogram', hist);
        }
        if (payload.outcomes) {
          const o = payload.outcomes;
          const bits = [
            o.rejectedAfterDelivery
              ? `rejected after delivery ×${o.rejectedAfterDelivery}`
              : null,
            o.noDelivery ? `no delivery ×${o.noDelivery}` : null,
            o.asBuyerRejected ? `rejected as buyer ×${o.asBuyerRejected}` : null,
          ].filter(Boolean);
          if (bits.length > 0) {
            printKeyValue('Outcomes', bits.join(' · '));
          }
        }
        printBlank();
        if (rows.length === 0) {
          printInfo('No review rows.');
        }
        for (const row of rows) {
          printLine(
            `  ★${row.stars} · ${truncateAddress(row.jobId)} · ${rowParty(row)}${
              row.text ? ` · ${firstLine(row.text)}` : ''
            }`,
          );
        }
        if (rows.length < count) {
          printBlank();
          printInfo(
            `Showing the newest ${rows.length} of ${count} — full list via --json or GET ${base}/reviews.`,
          );
        }
      } catch (error) {
        handleError(error);
      }
    },
  );
}
