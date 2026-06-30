import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type ChatMessage, chatCompletion, listModels } from '@t2000/sdk';
import { errorResult } from '../errors.js';

// `t2000_chat` + `t2000_models` — private inference on the t2000 Private API
// (SPEC_AUDRIC_API, S.575). Key-based: the server reads T2000_API_KEY from its
// env (set it in the MCP client config). The x402 no-key path is a later add.

const DEFAULT_MODEL = 'zai/glm-5.2';

export function registerChatTools(server: McpServer): void {
  server.tool(
    't2000_chat',
    "Run private inference on the t2000 Private API (OpenAI-compatible; ZDR by default, a `phala/*` tier is GPU-TEE confidential), billed to the user's t2000 credit. Requires T2000_API_KEY in the server env (generate at platform.t2000.ai — Pro/Max). Pass a single `prompt`, or a full `messages` list. Discover model ids with t2000_models; defaults to GLM 5.2.",
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
    'List the t2000 Private API model catalog (id · privacy tier · per-1M pricing). Call before t2000_chat to pick a model.',
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
