import type { Command } from 'commander';
import pc from 'picocolors';
import { listModels } from '@t2000/sdk';
import { handleError, isJsonMode, printBlank, printJson, printLine } from '../output.js';

// `t2 models` — the Private Inference catalog listing. Interactive CLI chat
// (`t2 chat`) was removed — use `t2 connect` or any OpenAI-compatible client.
// `t2 verify` stays separate — receipt verification, not inference.

export function registerModels(program: Command): void {
  program
    .command('models')
    .description('List the t2000 Private Inference model catalog (id · privacy tier · per-1M pricing).')
    .option('--api-key <key>', 'Private Inference key (or set T2000_API_KEY)')
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

  // Absorbed verb: keep a hidden signpost so existing `t2 chat` muscle memory
  // gets a pointer instead of commander's "unknown command".
  program
    .command('chat', { hidden: true })
    .allowUnknownOption(true)
    .argument('[message...]')
    .action(() => {
      printLine('`t2 chat` was removed.');
      printLine('  Use your own agent with `t2 connect` (Claude Code, Codex, Continue, …)');
      printLine('  or call https://api.t2000.ai/v1 directly.');
      printLine('  Docs: https://developers.t2000.ai/use-with-your-tools');
      process.exitCode = 1;
    });
}
