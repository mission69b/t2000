// `t2 agent review <seller> --stars 1-5 [--text …] [--digest …]` — Phase 4
// receipt-bound reviews (SPEC_STORE_V2 §8). Reviews attach to ONE settled
// purchase: with no --digest, the latest reviewable receipt for
// (you → seller) is resolved from the gateway; the signed message binds
// digest + stars + sha256(text) + timestamp, proving authorship with the
// same key that paid. Re-running on the same digest EDITS the review.

import { createHash } from 'node:crypto';
import type { Command } from 'commander';
import {
  handleError,
  isJsonMode,
  printBlank,
  printJson,
  printKeyValue,
  printSuccess,
} from '../../output.js';
import { withAgent } from '../../lib/with-agent.js';

const DEFAULT_GATEWAY = 'https://x402.t2000.ai';

async function fetchJson(
  url: string,
  init?: { method: string; body?: unknown },
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error;
    throw new Error(typeof err === 'string' ? err : `HTTP ${res.status}`);
  }
  return json;
}

/** Mirrors the gateway's reviewMessage() — keep the format in lockstep. */
function reviewMessage(
  digest: string,
  stars: number,
  text: string,
  timestamp: number,
): string {
  const hash = createHash('sha256').update(text, 'utf8').digest('hex');
  return `t2000-review:${digest}:${stars}:${hash}:${timestamp}`;
}

export function registerAgentReview(agent: Command): void {
  agent
    .command('review')
    .description(
      'Review a purchase (1-5 stars + optional text). Binds to your latest settled receipt with the seller, or --digest for a specific one. Re-run to edit. [Store v2]',
    )
    .argument('<seller>', 'Seller address (0x…)')
    .requiredOption('--stars <n>', 'Rating 1-5')
    .option('--text <text>', 'Review text (≤400 chars)')
    .option('--digest <digest>', 'Collect digest of the specific purchase')
    .option('--gateway <url>', `Gateway base URL (default ${DEFAULT_GATEWAY})`)
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .action(
      async (
        seller: string,
        opts: {
          stars: string;
          text?: string;
          digest?: string;
          gateway?: string;
          key?: string;
        },
      ) => {
        try {
          const stars = Number(opts.stars);
          if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
            throw new Error('--stars must be an integer 1-5.');
          }
          const text = (opts.text ?? '').trim();
          if (text.length > 400) {
            throw new Error('--text must be ≤ 400 chars.');
          }
          const gateway = opts.gateway ?? DEFAULT_GATEWAY;
          const agentW = await withAgent({ keyPath: opts.key });
          const buyer = agentW.address();

          let digest = (opts.digest ?? '').trim();
          if (!digest) {
            const res = await fetchJson(
              `${gateway}/commerce/review?buyer=${buyer}&seller=${encodeURIComponent(seller)}`,
            );
            const reviewable = (res.reviewable ?? []) as {
              digest: string;
              stars: number | null;
            }[];
            if (reviewable.length === 0) {
              throw new Error(
                'No settled purchase from this wallet to that seller — buy first (`t2 agent pay`), then review.',
              );
            }
            digest = reviewable[0].digest;
          }

          const timestamp = Date.now();
          const message = new TextEncoder().encode(
            reviewMessage(digest, stars, text, timestamp),
          );
          const { signature } = await agentW.keypair.signPersonalMessage(message);
          await fetchJson(`${gateway}/commerce/review`, {
            method: 'POST',
            body: { digest, stars, text, timestamp, signature },
          });

          if (isJsonMode()) {
            printJson({ ok: true, digest, stars, text: text || null });
            return;
          }
          printBlank();
          printSuccess(
            `Review posted — ${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}${text ? ` "${text}"` : ''}`,
          );
          printKeyValue('Receipt', digest);
          printKeyValue(
            'Listing',
            `https://agents.t2000.ai/${seller.startsWith('0x') ? seller : ''}`,
          );
          printBlank();
        } catch (e) {
          handleError(e);
        }
      },
    );
}
