import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type ChatMessage, chatCompletion, listModels } from '@t2000/sdk';
import { errorResult } from '../errors.js';

// `t2000_chat` + `t2000_models` — Private Inference, an AUDRIC product served
// from `api.audric.ai` (SPEC_PI_TO_AUDRIC, 2026-08-01). Key-based: the server
// reads T2000_API_KEY from its env (set it in the MCP client config); mint the
// key at audric.ai. These tools are only registered when a key is present.
//
// `t2000_verify` was REMOVED here 2026-08-01: confidential receipt verification
// is Audric's in-app Verify, not a t2000 product path. `verifyReceipt` remains
// in @t2000/sdk as the library Audric's BFF calls.

// Fast non-reasoning default — matches the CLI's `t2 chat` default (reasoning
// models like glm-5.2 are deeper but noticeably slower; opt in via `model`).
const DEFAULT_MODEL = 'openai/gpt-oss-120b';

export function registerChatTools(server: McpServer): void {
  server.tool(
    't2000_chat',
    "Run private inference on Audric Private Inference at api.audric.ai (OpenAI-compatible; ZDR by default, a `phala/*` tier is GPU-TEE confidential), billed to the user's Audric credit. Requires T2000_API_KEY in the server env — mint one at audric.ai (minting requires $5 of credit). Pass a single `prompt`, or a full `messages` list. Discover model ids with t2000_models; defaults to the fast gpt-oss-120b.",
    {
      prompt: z
        .string()
        .optional()
        .describe('User prompt (shorthand for a single user message)'),
      messages: z
        .array(
          z.object({
            role: z.enum(['system', 'user', 'assistant']),
            content: z.string(),
          }),
        )
        .optional()
        .describe('Full message list (overrides `prompt` when present)'),
      model: z
        .string()
        .optional()
        .describe(`Model id (default ${DEFAULT_MODEL}; see t2000_models)`),
      maxTokens: z.number().optional().describe('Max output tokens'),
      temperature: z.number().optional().describe('Sampling temperature (0–2)'),
    },
    async ({ prompt, messages, model, maxTokens, temperature }) => {
      try {
        const msgs: ChatMessage[] =
          messages ?? (prompt ? [{ role: 'user', content: prompt }] : []);
        if (msgs.length === 0) {
          throw new Error('Provide `prompt` or `messages`.');
        }
        const res = await chatCompletion({
          model: model ?? DEFAULT_MODEL,
          messages: msgs,
          maxTokens,
          temperature,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                model: res.model,
                content: res.content,
                usage: res.usage,
                // Confidential (phala/*) → a TEE attestation receipt id,
                // verifiable at /v1/aci/receipts/{id}.
                receiptId: res.receiptId,
              }),
            },
          ],
        };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.tool(
    't2000_models',
    'List the t2000 Private Inference model catalog (id · privacy tier · per-1M pricing). Call before t2000_chat to pick a model.',
    {},
    async () => {
      try {
        const models = await listModels();
        return { content: [{ type: 'text', text: JSON.stringify({ models }) }] };
      } catch (err) {
        return errorResult(err);
      }
    },
  );

}
