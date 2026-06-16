// [SPEC_AGENT_PAYMENTS_X402 item 2.14] `t2 status` — one-shot health/doctor
// check. Aggregates existing reads (no new state): CLI version, wallet +
// balances, spending limits, gateway reachability, and which AI clients have
// the MCP server wired. The "is my setup healthy?" onboarding + support
// primitive — answers the questions support would otherwise ask.

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

// NOTE: resolved relative to the BUNDLED output (tsup flattens to dist/), not
// the source dir — so this is `../package.json` (matching program.ts), not
// `../../`. dist/<chunk>.js → ../package.json = packages/cli/package.json.
const require = createRequire(import.meta.url);
const { version: CLI_VERSION } = require('../package.json') as { version: string };

const GATEWAY_URL = process.env.T2000_GATEWAY_URL ?? 'https://mpp.t2000.ai';
const GATEWAY_TIMEOUT_MS = 3000;

interface GatewayStatus {
  url: string;
  reachable: boolean;
  latencyMs: number | null;
}

async function checkGateway(): Promise<GatewayStatus> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);
    const res = await fetch(`${GATEWAY_URL}/api/services`, { signal: controller.signal });
    clearTimeout(timer);
    return { url: GATEWAY_URL, reachable: res.ok, latencyMs: Date.now() - start };
  } catch {
    return { url: GATEWAY_URL, reachable: false, latencyMs: null };
  }
}

async function checkMcpClients(): Promise<Array<{ name: string; wired: boolean }>> {
  const platforms = getPlatformConfigs();
  return Promise.all(
    platforms.map(async (p) => ({ name: p.name, wired: hasMcpEntry(await readJsonFile(p.path)) })),
  );
}

export function registerStatus(program: Command) {
  program
    .command('status')
    .description('Health check: wallet, balances, limits, MCP wiring, gateway reachability')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .action(async (opts: { key?: string }) => {
      try {
        // Reads run in parallel — gateway + MCP don't depend on the wallet.
        const [agentResult, gateway, mcpClients] = await Promise.all([
          tryWithAgent({ keyPath: opts.key }),
          checkGateway(),
          checkMcpClients(),
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
          printJson({ cliVersion: CLI_VERSION, wallet, balance, limits, gateway, mcpClients });
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

        printKeyValue(
          'Gateway',
          gateway.reachable
            ? `${pc.green('✓ reachable')} ${pc.dim(`(${gateway.latencyMs}ms)`)}`
            : `${pc.red('✗ unreachable')} ${pc.dim(`(${gateway.url})`)}`,
        );

        const mcpSummary = mcpClients
          .map((c) => `${c.name} ${c.wired ? pc.green('✓') : pc.dim('✗')}`)
          .join('  ·  ');
        printKeyValue('MCP wired', mcpSummary);
        if (!mcpClients.some((c) => c.wired)) {
          printLine(pc.dim('  Run `t2 mcp install` to connect Claude / Cursor / Windsurf.'));
        }
        printBlank();
      } catch (err) {
        handleError(err);
      }
    });
}
