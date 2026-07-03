import type { Command } from 'commander';
import pc from 'picocolors';
import {
  type ChatMessage,
  chatCompletion,
  chatCompletionStream,
  listModels,
} from '@t2000/sdk';
import {
  handleError,
  isJsonMode,
  printBlank,
  printJson,
  printLine,
} from '../output.js';

// A confidential (phala/*) response carries a TEE attestation receipt id —
// surface it so the confidentiality is visible + verifiable (GET /v1/aci/receipts/{id}).
function receiptLine(receiptId: string | undefined): void {
  if (receiptId) {
    printLine(pc.dim(`🔒 confidential · attested · receipt ${receiptId}`));
  }
}

// `t2 chat` + `t2 models` — the agent-native distribution surface for the
// t2000 Private API (SPEC_AUDRIC_API, S.575). Key-based today (`--api-key` or
// T2000_API_KEY from agents.t2000.ai/manage); the x402 no-key pay-per-call path is a
// later add. The SDK owns the HTTP/SSE; this is the thin CLI wrapper.

// Fast, sensible, general-purpose default (non-reasoning, ~5s) so out-of-the-box
// `t2 chat` is snappy. Reasoning models (glm-5.2, kimi) + the confidential
// `phala/*` tier are explicit opt-ins via --model (see `t2 models`).
const DEFAULT_MODEL = 'openai/gpt-oss-120b';

function numOrUndef(v: string | undefined): number | undefined {
  if (v === undefined) {
    return;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function registerChat(program: Command): void {
  program
    .command('chat')
    .argument('<message...>', 'Your prompt')
    .description(
      "Chat with a model on the t2000 Private API (OpenAI-compatible, ZDR; a phala/* tier is GPU-TEE confidential). Needs an API key — generate one at agents.t2000.ai/manage, then pass --api-key or set T2000_API_KEY.",
    )
    .option('--model <id>', `Model id (default ${DEFAULT_MODEL}; see \`t2 models\`)`, DEFAULT_MODEL)
    .option('--system <text>', 'System prompt')
    .option('--max-tokens <n>', 'Max output tokens')
    .option('--temperature <t>', 'Sampling temperature (0–2)')
    .option('--no-stream', 'Wait for the full response instead of streaming')
    .option('--api-key <key>', 'Private API key (or set T2000_API_KEY)')
    .option('--api <url>', 'API base URL (default https://api.t2000.ai/v1)')
    .action(
      async (
        messageParts: string[],
        opts: {
          model: string;
          system?: string;
          maxTokens?: string;
          temperature?: string;
          stream?: boolean;
          apiKey?: string;
          api?: string;
        },
      ) => {
        try {
          const messages: ChatMessage[] = [];
          if (opts.system) {
            messages.push({ role: 'system', content: opts.system });
          }
          messages.push({ role: 'user', content: messageParts.join(' ') });

          const params = {
            model: opts.model,
            messages,
            apiKey: opts.apiKey,
            apiBase: opts.api,
            maxTokens: numOrUndef(opts.maxTokens),
            temperature: numOrUndef(opts.temperature),
          };

          // JSON mode (and --no-stream) → one non-streaming completion.
          if (isJsonMode() || opts.stream === false) {
            const res = await chatCompletion(params);
            if (isJsonMode()) {
              printJson({
                model: res.model,
                content: res.content,
                usage: res.usage,
                receiptId: res.receiptId,
              });
              return;
            }
            printBlank();
            printLine(res.content);
            receiptLine(res.receiptId);
            printBlank();
            return;
          }

          // Default: stream deltas straight to stdout. Drive the generator
          // manually so we can capture its return value (the receipt id).
          const gen = chatCompletionStream(params);
          let any = false;
          let next = await gen.next();
          while (!next.done) {
            process.stdout.write(next.value);
            any = true;
            next = await gen.next();
          }
          process.stdout.write(any ? '\n' : '');
          receiptLine(next.value?.receiptId);
        } catch (error) {
          handleError(error);
        }
      },
    );

  program
    .command('models')
    .description('List the t2000 Private API model catalog (id · privacy tier · per-1M pricing).')
    .option('--api-key <key>', 'Private API key (or set T2000_API_KEY)')
    .option('--api <url>', 'API base URL (default https://api.t2000.ai/v1)')
    .action(async (opts: { apiKey?: string; api?: string }) => {
      try {
        const models = await listModels({ apiKey: opts.apiKey, apiBase: opts.api });
        if (isJsonMode()) {
          printJson({ models });
          return;
        }
        const usd = (n: number | undefined): string =>
          n == null ? '?' : `$${Number(n.toFixed(4))}`;
        printBlank();
        for (const m of models) {
          const price =
            m.inputPer1M != null
              ? ` — ${usd(m.inputPer1M)}/${usd(m.outputPer1M)} per 1M`
              : '';
          const priv = m.privacy ? ` [${m.privacy}]` : '';
          const think = m.reasoning ? pc.dim(' · reasoning (deeper, slower)') : '';
          printLine(`  ${m.id}${priv}${price}${think}`);
        }
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
