// `t2 check <url>` — validate a paid API against the catalog listing gates
// (dry run), or list it with --list. [SPEC_T2_AGENTS_STORE]
//
// Thin adapter over the gateway's /api/catalog/preview + /submit routes —
// the gates live server-side ONLY, so `t2 check` and the /sell page can
// never disagree. Read-only by default; no wallet needed either way (the
// listing identity is the payTo wallet in the API's own 402 challenge).

import type { Command } from 'commander';
import {
  handleError,
  isJsonMode,
  printBlank,
  printHeader,
  printInfo,
  printJson,
  printKeyValue,
  printLine,
  printSuccess,
} from '../output.js';

const DEFAULT_GATEWAY_BASE = process.env.T2000_GATEWAY_URL ?? 'https://mpp.t2000.ai';

type GateResult = { gate: string; ok: boolean; detail: string };
type SellerWarning = { code: string; message: string; prompt: string };
type PreviewResponse = {
  ok?: boolean;
  gates?: GateResult[];
  service?: {
    name: string;
    description: string;
    endpoints: { method: string; path: string; price: string; description: string }[];
  };
  payTo?: string;
  warnings?: SellerWarning[];
  serviceId?: string;
  url?: string;
  storeUrl?: string;
  error?: string;
};

export function registerCheck(program: Command) {
  program
    .command('check')
    .argument('<url>', 'Your paid API endpoint (https, answers 402)')
    .description(
      'Check a paid API against the t2 Agents listing gates (payable 402 · x402 envelope · price cap) — dry run, nothing is paid or listed. Add --list to list it. No account needed: the 402 challenge’s payTo wallet is the seller identity.',
    )
    .option('--list', 'List it in the catalog when the checks pass')
    .option('--gateway <url>', `Gateway base URL (default ${DEFAULT_GATEWAY_BASE})`)
    .action(async (url: string, opts: { list?: boolean; gateway?: string }) => {
      try {
        const base = opts.gateway ?? DEFAULT_GATEWAY_BASE;
        const route = opts.list ? 'submit' : 'preview';
        const res = await fetch(`${base}/api/catalog/${route}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url }),
        });
        const out = (await res.json().catch(() => ({}))) as PreviewResponse;
        if (out.error && !out.gates) {
          throw new Error(out.error);
        }

        if (isJsonMode()) {
          printJson(out);
          if (!out.ok) process.exitCode = 1;
          return;
        }

        printBlank();
        for (const gate of out.gates ?? []) {
          printInfo(`${gate.ok ? '✓' : '✗'} ${gate.gate}: ${gate.detail}`);
        }
        printBlank();

        if (!out.ok) {
          printInfo('Not listable yet — fix the failing gate above and re-run.');
          printInfo(`Seller guide: ${base}/sellers.md`);
          printBlank();
          process.exitCode = 1;
          return;
        }

        if (opts.list) {
          printSuccess('Listed.');
          if (out.url) printKeyValue('Catalog', out.url);
          if (out.storeUrl) printKeyValue('Store page', out.storeUrl);
        } else {
          printHeader(out.service?.name ?? url);
          if (out.payTo) printKeyValue('Pays', out.payTo);
          for (const ep of out.service?.endpoints ?? []) {
            printLine(`  ${ep.method} ${ep.path} — $${ep.price}${ep.description ? ` — ${ep.description}` : ''}`);
          }
          printBlank();
          printInfo('All gates pass. List it with: t2 check <url> --list');
        }

        const warnings = out.warnings ?? [];
        if (warnings.length > 0) {
          printBlank();
          printHeader(`Listing quality — ${warnings.length} improvement(s)`);
          for (const w of warnings) {
            printInfo(`• ${w.message}`);
            printLine('  Paste this into your coding agent to fix it:');
            printLine(`  ${w.prompt}`);
            printBlank();
          }
        }
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
