// [SPEC_AGENT_PAYMENTS_X402 item 2.14] `t2 status` — one-shot health/doctor
// check. Aggregates existing reads (no new state): CLI version, wallet +
// balances, and spending limits. The "is my setup healthy?" onboarding +
// support primitive — answers the questions support would otherwise ask.
// The MCP surface is the hosted Connect URL (SPEC_T2_KILL_STDIO); the only
// stdio-related read left is a stale-config warning that points at cleanup.

import type { Command } from 'commander';
import pc from 'picocolors';
import { createRequire } from 'node:module';
import { tryWithAgent } from '../lib/with-agent.js';
import { getPlatformConfigs, readJsonFile, hasMcpEntry } from './mcp/platforms.js';
import {
  printJson,
  isJsonMode,
  handleError,
  printBlank,
  printKeyValue,
  printLine,
} from '../output.js';

// NOTE: from the BUNDLED output (tsup flattens to dist/) this file sits one
// level below packages/cli, so `../package.json` resolves. From SOURCE
// (vitest importing src/commands/status.ts) it's two levels down — hence the
// fallback, which keeps the module importable in both contexts.
const require = createRequire(import.meta.url);
const { version: CLI_VERSION } = (() => {
  try {
    return require('../package.json') as { version: string };
  } catch {
    return require('../../package.json') as { version: string };
  }
})();

// The hosted mpp gateway reachability probe was REMOVED 2026-08-01
// (SPEC_T2_CLEANUP_USDC_ONLY): there is no t2000-hosted proxy catalog to be
// reachable. Sellers run their own x402 endpoints, so there is no single
// host whose health means anything here.

/** Clients still carrying the RETIRED stdio entry (→ `t2 mcp uninstall`). */
async function staleStdioClients(): Promise<string[]> {
  const platforms = getPlatformConfigs();
  const wired = await Promise.all(
    platforms.map(async (p) => ({ name: p.name, wired: hasMcpEntry(await readJsonFile(p.path)) })),
  );
  return wired.filter((c) => c.wired).map((c) => c.name);
}

export function registerStatus(program: Command) {
  program
    .command('status')
    .description('Health check: wallet, balances, limits')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .action(async (opts: { key?: string }) => {
      try {
        // Reads run in parallel — config checks don't depend on the wallet.
        const [agentResult, staleStdio] = await Promise.all([
          tryWithAgent({ keyPath: opts.key }),
          staleStdioClients(),
        ]);

        let wallet: { created: boolean; address?: string } = { created: false };
        let balance: { totalUsd: number; stables: Record<string, number>; sui: number } | null = null;
        let limits: { perTxUsd?: number; dailyUsd?: number; spentTodayUsd: number } | null = null;

        if (agentResult.kind === 'ok') {
          const agent = agentResult.agent;
          wallet = { created: true, address: agent.address() };
          try {
            const b = await agent.balance();
            balance = { totalUsd: b.totalUsd, stables: b.stables, sui: b.sui.amount };
          } catch {
            balance = null;
          }
          const lim = agent.limits.getLimits();
          limits = {
            perTxUsd: lim?.perTxUsd,
            dailyUsd: lim?.dailyUsd,
            spentTodayUsd: agent.limits.dailySpentToday(),
          };
        }

        if (isJsonMode()) {
          printJson({ cliVersion: CLI_VERSION, wallet, balance, limits, staleStdio });
          return;
        }

        printBlank();
        printLine(pc.bold('t2000 Agent Wallet — status'));
        printBlank();
        printKeyValue('CLI version', CLI_VERSION);

        if (wallet.created && wallet.address) {
          const short = `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`;
          printKeyValue('Wallet', `${short} ${pc.green('✓')}`);
          if (balance) {
            const parts = Object.entries(balance.stables)
              .map(([k, v]) => `${k} ${v}`)
              .concat(`SUI ${balance.sui}`)
              .join(', ');
            printKeyValue('Balance', `$${balance.totalUsd.toFixed(2)}  ${pc.dim(`(${parts})`)}`);
          } else {
            printKeyValue('Balance', pc.dim('(could not read — network?)'));
          }
          if (limits && (limits.perTxUsd !== undefined || limits.dailyUsd !== undefined)) {
            const caps = [
              limits.perTxUsd !== undefined ? `$${limits.perTxUsd}/tx` : null,
              limits.dailyUsd !== undefined ? `$${limits.dailyUsd}/day` : null,
            ]
              .filter(Boolean)
              .join(' · ');
            printKeyValue('Limits', `${caps}  ${pc.dim(`(spent today: $${limits.spentTodayUsd.toFixed(2)})`)}`);
          } else {
            printKeyValue('Limits', pc.dim('off (no caps set)'));
          }
        } else {
          printKeyValue('Wallet', `${pc.yellow('not created')} ${pc.dim('— run `t2 init`')}`);
        }

        printKeyValue('MCP', 'https://mcp.t2000.ai/mcp  ' + pc.dim('(hosted — add as a connector in any MCP client)'));
        if (staleStdio.length > 0) {
          printLine(
            pc.yellow(`  Stale stdio config in ${staleStdio.join(', ')} — the local server is retired; run \`t2 mcp uninstall\`.`)
          );
        }
        printBlank();
      } catch (err) {
        handleError(err);
      }
    });
}
