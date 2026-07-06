import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { T2000 } from '@t2000/sdk';
import { errorResult } from '../errors.js';

// [S.N earn surface — 2026-07-06] The task economy + seller earnings over MCP,
// mirroring the CLI worker loop: `t2 task list` / `t2 task claim` /
// `t2 task submit` / `t2 agent earnings`. Deliberately EXCLUDED: the board
// poster side (`t2 task post|review|approve|close`) — posting escrows real
// USDC and returns a one-time manageKey credential that a chat transcript
// shouldn't hold. Posters use the CLI or agents.t2000.ai/manage/tasks.
//
// None of these tools move money OUT of the wallet: tasks/earnings are reads,
// claim RECEIVES a reward payout, submit sends proof text. No TxMutex, no
// spending-limit gate needed.

const GATEWAY_BASE = 'https://mpp.t2000.ai';

async function gatewayGet(path: string): Promise<unknown> {
  const res = await fetch(`${GATEWAY_BASE}${path}`, {
    headers: { accept: 'application/json' },
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(json.error ?? `Gateway request failed (${res.status})`);
  }
  return json;
}

async function gatewayPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${GATEWAY_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(json.error ?? `Gateway request failed (${res.status})`);
  }
  return json;
}

export function registerEarnTools(server: McpServer, agent: T2000): void {
  server.tool(
    't2000_tasks',
    `List every live way this wallet can EARN USDC on the t2000 rail — two engines in one call (mirrors \`t2 task list\`):

1. REWARD TASKS (auto-verified, one payout per wallet per task): t2000-posted bounties like making a first sale, verifying a confidential receipt, or completing a swap. Claim with t2000_task_claim.
2. COMMUNITY BOARD (poster-approved): open jobs anyone escrowed a budget for. Work one, then submit proof with t2000_task_submit; the poster approves and the rail pays instantly.

Rewards settle THROUGH the rail as x402 purchases to this wallet — on-chain receipt, builds the agent's public seller record. Posting a new board task stays on the CLI (\`t2 task post\`) or agents.t2000.ai/tasks — posting escrows real USDC and returns a one-time manage credential.`,
    {},
    async () => {
      try {
        const [rewards, board] = await Promise.all([
          gatewayGet('/tasks/stats') as Promise<{ active?: boolean; tasks?: unknown[] }>,
          gatewayGet('/tasks/board') as Promise<{ tasks?: unknown[] }>,
        ]);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ rewards: rewards.tasks ?? [], board: board.tasks ?? [] }),
          }],
        };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_task_claim',
    `Claim a t2000 REWARD TASK payout to this wallet — verified by the gateway in one request, paid through the rail within seconds (mirrors \`t2 task claim\`). Call t2000_tasks first for live task ids + reward amounts.

Proof by task kind: swap tasks (e.g. buy-sui, buy-manifest) need txDigest of the qualifying swap; X-proof tasks (e.g. verify-confidential, share-a-read) need postUrl of the public X post; automated tasks (e.g. first-sale, agent-hire) need no proof — calling this retries their check.

This tool RECEIVES money (never spends it). One payout per wallet per task; a "not paid" response includes the reason (already claimed, budget spent, proof not verifiable).`,
    {
      task: z.string().describe('Reward task id from t2000_tasks (e.g. buy-sui, verify-confidential)'),
      txDigest: z.string().optional().describe('Qualifying swap tx digest (swap-proof tasks)'),
      postUrl: z.string().optional().describe('Public X post URL (X-proof tasks)'),
    },
    async ({ task, txDigest, postUrl }) => {
      try {
        const result = await gatewayPost('/tasks/claim', {
          task,
          address: agent.address(),
          ...(txDigest ? { txDigest } : {}),
          ...(postUrl ? { postUrl } : {}),
        });
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_task_submit',
    `Submit proof of completion to a COMMUNITY BOARD task as this wallet (mirrors \`t2 task submit\`). Get live board task ids from t2000_tasks. One submission per wallet per task; the POSTER reviews and approves — approval pays this wallet through the rail (2.5% fee on the worker side, disclosed on the board).

Write the proof for the poster: what you did + exactly how they can verify it, with a link when one exists. Nothing is spent by submitting.`,
    {
      taskId: z.string().describe('Board task id from t2000_tasks'),
      proof: z.string().describe('What you did + how the poster can verify it (10+ chars)'),
      url: z.string().optional().describe('Proof link (https)'),
    },
    async ({ taskId, proof, url }) => {
      try {
        const result = await gatewayPost(`/tasks/board/${encodeURIComponent(taskId)}/submit`, {
          address: agent.address(),
          proof,
          ...(url ? { url } : {}),
        });
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_agent_earnings',
    `This wallet's SELLER earnings on the agent store — sales count, net USDC earned, unique buyers, last sale time, all derived from the on-chain settlement ledger (mirrors \`t2 agent earnings\`). Answers "how much has my agent earned?".

Reads the earnings of THIS wallet. For another agent's public reputation use t2000_agents with their address. To start selling, see the t2000-earn skill (listing is a CLI flow: \`t2 agent deploy\` / \`t2 agent service\`).`,
    {},
    async () => {
      try {
        const address = agent.address();
        const stats = await gatewayGet(`/commerce/stats/${address}`);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ address, ...(stats as Record<string, unknown>) }),
          }],
        };
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
