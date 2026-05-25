import { describe, it, expect, vi, beforeEach } from 'vitest';

import { transactionHistoryTool } from '../tools/history.js';
import { callToolBody } from './_helpers/call-tool-body.js';
import type { ToolContext } from '../types.js';

// [v1.4 — Day 3] The `defillama_yield_pools` ACI tests that lived here
// were deleted alongside the tool.
// [S.245 — 2026-05-22] The `mpp_services` describe block was deleted —
// the tool was removed entirely per V07E_D_QUESTION_AUDITS D-2 reframe.
// Only `transaction_history` ACI behaviour remains in scope.

const baseCtx = {
  walletAddress: '0xtest',
  suiRpcUrl: 'https://stub',
} as unknown as ToolContext;

// [P2.1 / S.288 — 2026-05-24] `.optional()` → `.nullable()` conversion
// made these filter fields required-but-nullable. See history-labels.test.ts.
const EMPTY_FILTERS = {
  counterparty: null,
  date: null,
  action: null,
  minUsd: null,
  assetSymbol: null,
  direction: null,
} as const;

describe('[v1.4 ACI] transaction_history — action filter + 30-day default', () => {
  beforeEach(() => {
    const now = Date.now();
    const recent = (offsetDays: number, action: string) => ({
      digest: `0x${action}${offsetDays}`,
      timestampMs: String(now - offsetDays * 86_400_000),
      effects: { gasUsed: { computationCost: '0', storageCost: '0', storageRebate: '0' } },
      transaction: {
        data: {
          transaction: {
            commands:
              action === 'send'
                ? [{ TransferObjects: {} }]
                : [{ MoveCall: { package: 'p', module: 'navi', function: 'borrow' } }],
          },
        },
      },
      balanceChanges: [],
    });

    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          result: {
            data: [
              recent(1, 'send'),
              recent(5, 'send'),
              recent(10, 'lending'),
              recent(45, 'send'),    // outside 30-day window
            ],
            nextCursor: null,
            hasNextPage: false,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as typeof fetch;
  });

  it('drops transactions older than 30 days when no date is supplied', async () => {
    const res = await callToolBody(transactionHistoryTool, { limit: 10, ...EMPTY_FILTERS }, baseCtx);
    const data = res.data as { transactions: Array<{ digest: string }>; lookbackDays: number };
    expect(data.lookbackDays).toBe(30);
    expect(data.transactions.find((t) => t.digest.endsWith('45'))).toBeUndefined();
  });

  it('filters by action when supplied', async () => {
    const res = await callToolBody(transactionHistoryTool, { limit: 10, ...EMPTY_FILTERS, action: 'lending' }, baseCtx);
    const data = res.data as { transactions: Array<{ action: string }>; action: string };
    expect(data.action).toBe('lending');
    for (const t of data.transactions) expect(t.action).toBe('lending');
  });
});

