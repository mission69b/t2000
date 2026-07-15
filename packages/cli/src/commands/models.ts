import type { Command } from 'commander';
import pc from 'picocolors';
import { listModels } from '@t2000/sdk';
import { handleError, isJsonMode, printBlank, printJson, printLine } from '../output.js';

// `t2 models` — the Private Inference catalog listing. Interactive/one-shot
// inference in the CLI moved to `t2 code` (npm install -g @t2000/code); the
// old `t2 chat` verb was absorbed there per SPEC_INFERENCE_DEMAND (one
// inference surface). `t2 verify` stays separate — receipt verification, not
// inference.

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
      printLine('`t2 chat` moved into t2 code — the coding agent on the same rail.');
      printLine('  npm install -g @t2000/code');
      printLine('  t2code "your prompt"        # interactive');
      printLine('  t2code exec "your task"     # one-shot, headless');
      process.exitCode = 1;
    });
}
