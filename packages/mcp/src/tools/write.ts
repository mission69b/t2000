import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { T2000, SupportedAsset } from '@t2000/sdk';
import { TxMutex } from '../mutex.js';
import { errorResult } from '../errors.js';

// [v4.0 Phase B — 2026-05-26] MCP write surface mirrors the v4 CLI:
//   t2 send (asset-required) | t2 swap (Cetus aggregator) | t2 pay
// Deleted in S.336 alongside the CLI bulk delete (S.332):
//   t2000_save / t2000_withdraw / t2000_borrow / t2000_repay /
//   t2000_claim_rewards (DeFi — audric.ai owns it)
//   t2000_contact_add / t2000_contact_remove (SuiNS supersedes local
//   contacts; the deprecation banner already shipped in S.279.x)
//
// H5 CLOSED (R-0 F1, 2026-06-15). The spending-limit gate lives in the SDK
// write paths (`@t2000/sdk/limits` → enforced inside `agent.send/swap/pay`),
// so these MCP write tools inherit the SAME per-tx + cumulative-daily cap the
// CLI obeys — one gate, no bypass. (The legacy v3 `SafeguardEnforcer` +
// `maxPerTx`/`maxDailySend` schema were deleted in the same slice.)

function extractImageUrls(data: unknown): string[] {
  const urls: string[] = [];
  const urlPattern = /^https?:\/\/.+\.(png|jpg|jpeg|webp|gif)/i;

  function walk(obj: unknown): void {
    if (typeof obj === 'string' && urlPattern.test(obj)) {
      urls.push(obj);
    } else if (Array.isArray(obj)) {
      for (const item of obj) walk(item);
    } else if (obj && typeof obj === 'object') {
      for (const val of Object.values(obj as Record<string, unknown>)) walk(val);
    }
  }

  walk(data);
  return urls;
}

export function registerWriteTools(server: McpServer, agent: T2000): void {
  const mutex = new TxMutex();

  server.tool(
    't2000_send',
    'Send USDC, USDsui, or SUI to a 0x Sui address or a SuiNS name (e.g. alex.sui). Amount is in token units (1 USDC = $1). Asset is REQUIRED — there is no implicit USDC default. USDC + USDsui sends are gasless (Sui foundation sponsored); SUI sends require gas. Set dryRun: true to preview without signing. Mirrors `t2 send <amount> <ASSET> <recipient>`.',
    {
      to: z.string().describe("Recipient: 0x Sui address or SuiNS name like 'alex.sui'."),
      amount: z.number().positive().describe('Amount in token units to send'),
      asset: z.enum(['USDC', 'USDsui', 'SUI']).describe('REQUIRED — one of USDC, USDsui, SUI. No default.'),
      dryRun: z.boolean().optional().describe('Preview without signing (default: false)'),
    },
    async ({ to, amount, asset, dryRun }) => {
      try {
        const resolved = await agent.resolveRecipient(to);

        if (dryRun) {
          const balance = await agent.balance();
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                preview: true,
                canSend: balance.available >= amount,
                amount,
                to: resolved.address,
                suinsName: resolved.suinsName,
                asset,
                gasless: asset === 'USDC' || asset === 'USDsui',
                currentBalance: balance.available,
                balanceAfter: balance.available - amount,
              }),
            }],
          };
        }

        const result = await mutex.run(() =>
          agent.send({ to, amount, asset: asset as SupportedAsset }),
        );
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_swap',
    'Swap tokens on Sui via Cetus Aggregator (20+ DEXs). Supports any token pair with liquidity. Use user-friendly names (SUI, USDC, USDsui, CETUS, DEEP, etc.) or full coin types. NOTE: Swap is NOT gasless — the wallet must hold some SUI for gas (typically < $0.01 per swap). Mirrors `t2 swap <amount> <FROM> <TO>`.',
    {
      from: z.string().describe('Source token (e.g. "SUI", "USDC", or full coin type)'),
      to: z.string().describe('Target token (e.g. "USDC", "CETUS", or full coin type)'),
      amount: z.number().positive().describe('Amount of the source token to swap'),
      slippage: z.number().min(0.001).max(0.05).optional().describe('Max slippage (default 0.01 = 1%, max 5%)'),
    },
    async ({ from, to, amount, slippage }) => {
      try {
        const result = await mutex.run(() => agent.swap({ from, to, amount, slippage }));
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_pay',
    `Pay for a paid API request over x402: handles the 402 payment challenge automatically from the agent's USDC balance and returns the API response plus the payment receipt. The USDC transfer is gasless (Sui foundation sponsored). Mirrors \`t2 pay <url>\`.

WHAT THIS PAYS: any x402 endpoint — an ASP's Service listed on the t2000 store (find them with t2000_services), or any URL the user hands you that answers 402 with a Sui challenge. t2000 does NOT proxy or resell third-party APIs, so there is no catalog of provider URLs to pick from: use the seller's own endpoint URL.

IMPORTANT: if the user asks for a capability that is not listed in the marketplace and they have not given you an endpoint URL, do not guess a URL and do not claim it is unreachable — say what is listed, and offer to post the work as an Open job (t2000_job_open) for an ASP to claim.

Responses that return media (image or audio URLs) should be surfaced to the user so they can view or play the asset.
`,
    {
      url: z.string().describe("Full URL of the x402 endpoint (an ASP Service from t2000_services, or a URL the user supplied)"),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('POST').describe('HTTP method (most services use POST)'),
      body: z.string().optional().describe('JSON request body (required for POST endpoints)'),
      headers: z.record(z.string()).optional().describe('Additional HTTP headers'),
      maxPrice: z.number().default(1.0).describe('Max USD to pay (default: $1.00). Set higher for commerce services.'),
    },
    async ({ url, method, body, headers, maxPrice }) => {
      try {
        const result = await mutex.run(() =>
          agent.pay({ url, method, body, headers, maxPrice }),
        );

        let text = JSON.stringify(result);

        try {
          const data = typeof result === 'string' ? JSON.parse(result) : result;
          const imageUrls = extractImageUrls(data);
          if (imageUrls.length > 0) {
            const urlList = imageUrls.slice(0, 4).map((u) => `- ${u}`).join('\n');
            text = `Generated images:\n${urlList}\n\n${text}`;
          }
        } catch { /* not JSON or no images */ }

        const MAX_BYTES = 800_000;
        if (text.length > MAX_BYTES) {
          text = text.slice(0, MAX_BYTES) + '\n\n[Response truncated — exceeded size limit]';
        }

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_agent_sell',
    "Sell this agent's x402 API endpoint as a Service on its public Agent ID, so buyers can pay it per call in USDC. The endpoint is LIVE-PROBED server-side first (must answer 402 with a valid Sui payment challenge — probe failures are returned per-check), then one sponsored (gasless) signature sets it on-chain. The Service appears on t2000.ai and api.t2000.ai/v1/agents/{address} immediately, and buyers find it with t2000_services. Requires an on-chain Agent ID (`t2 agent register`). Set remove: true to clear the listing. Mirrors `t2 agent sell <endpoint>`. This does NOT spend funds.",
    {
      endpoint: z.string().optional().describe('Your x402 endpoint URL (https). Omit only with remove: true.'),
      remove: z.boolean().optional().describe('Remove the listing instead of setting one (default: false)'),
    },
    async ({ endpoint, remove }) => {
      try {
        if (!(remove || endpoint)) {
          throw new Error('Provide the x402 endpoint URL (or remove: true to clear the listing).');
        }
        const address = agent.address();
        const target = remove ? '' : (endpoint as string);
        const base = 'https://api.t2000.ai/v1';

        const prepRes = await fetch(`${base}/agent/endpoint/prepare`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, endpoint: target }),
        });
        const prep = (await prepRes.json().catch(() => ({}))) as {
          nonce?: string;
          txBytes?: string;
          probe?: {
            ok?: boolean;
            amount?: string | null;
            currency?: string | null;
            issues?: { message?: string; code?: string }[];
          } | null;
          error?: { message?: string } | string;
        };
        if (!prepRes.ok) {
          const msg = typeof prep.error === 'string' ? prep.error : (prep.error?.message ?? `HTTP ${prepRes.status}`);
          // Surface the probe's per-check findings so the agent can fix its endpoint.
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ ok: false, error: msg, probeIssues: prep.probe?.issues ?? [] }),
            }],
            isError: true,
          };
        }
        if (!(prep.nonce && prep.txBytes)) {
          throw new Error('Failed to prepare the listing.');
        }
        const bytes = new Uint8Array(Buffer.from(prep.txBytes, 'base64'));
        const { signature } = await agent.signer.signTransaction(bytes);
        const subRes = await fetch(`${base}/agent/endpoint/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nonce: prep.nonce, address, signature }),
        });
        const sub = (await subRes.json().catch(() => ({}))) as { digest?: string; error?: { message?: string } | string };
        if (!subRes.ok) {
          const msg = typeof sub.error === 'string' ? sub.error : (sub.error?.message ?? `HTTP ${subRes.status}`);
          throw new Error(msg);
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              ok: true,
              listed: !remove,
              endpoint: remove ? null : target,
              pricePerCall: prep.probe?.amount ? `${prep.probe.amount} ${prep.probe.currency ?? 'USDC'}` : undefined,
              profile: `https://t2000.ai/${address}`,
              digest: sub.digest,
            }),
          }],
        };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

}
