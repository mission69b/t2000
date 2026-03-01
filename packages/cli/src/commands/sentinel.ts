import type { Command } from 'commander';
import { T2000, MIST_PER_SUI } from '@t2000/sdk';
import type { SentinelAgent } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import {
  printSuccess,
  printKeyValue,
  printBlank,
  printJson,
  isJsonMode,
  handleError,
  printHeader,
  printInfo,
  printLine,
  printDivider,
  explorerUrl,
} from '../output.js';
import pc from 'picocolors';

function formatSui(mist: bigint): string {
  return (Number(mist) / Number(MIST_PER_SUI)).toFixed(2);
}

function truncateId(id: string, chars = 8): string {
  if (id.length <= chars * 2 + 3) return id;
  return `${id.slice(0, chars + 2)}...${id.slice(-chars)}`;
}

export function registerSentinel(program: Command) {
  const sentinel = program
    .command('sentinel')
    .description('Interact with Sui Sentinel — attack AI agents, earn bounties');

  sentinel
    .command('list')
    .description('List active sentinels with prize pools')
    .action(async () => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin });
        const sentinels = await agent.sentinelList();

        if (isJsonMode()) {
          printJson(sentinels.map((s) => ({
            ...s,
            attackFee: s.attackFee.toString(),
            prizePool: s.prizePool.toString(),
          })));
          return;
        }

        if (sentinels.length === 0) {
          printBlank();
          printInfo('No active sentinels found.');
          printBlank();
          return;
        }

        printHeader('Active Sentinels');

        const header = `  ${'#'.padEnd(4)}${'Name'.padEnd(20)}${'Prize Pool'.padEnd(14)}${'Fee'.padEnd(12)}${'Attacks'.padEnd(10)}ID`;
        printLine(pc.dim(header));
        printDivider(90);

        sentinels.forEach((s, i) => {
          const num = String(i + 1).padEnd(4);
          const name = s.name.slice(0, 18).padEnd(20);
          const pool = `${formatSui(s.prizePool)} SUI`.padEnd(14);
          const fee = `${formatSui(s.attackFee)} SUI`.padEnd(12);
          const attacks = String(s.totalAttacks).padEnd(10);
          const id = truncateId(s.objectId);
          printLine(`  ${num}${name}${pool}${fee}${attacks}${pc.dim(id)}`);
        });

        printBlank();
        printInfo(`${sentinels.length} active sentinel${sentinels.length === 1 ? '' : 's'}`);
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

  sentinel
    .command('info')
    .description('Show details for a sentinel')
    .argument('<id>', 'Sentinel object ID or agent ID')
    .action(async (id: string) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin });
        const s = await agent.sentinelInfo(id);

        if (isJsonMode()) {
          printJson({
            ...s,
            attackFee: s.attackFee.toString(),
            prizePool: s.prizePool.toString(),
          });
          return;
        }

        printHeader(s.name);
        printKeyValue('Object ID', s.objectId);
        printKeyValue('Agent ID', s.id);
        printKeyValue('Model', s.model);
        printKeyValue('State', s.state);
        printKeyValue('Attack Fee', `${formatSui(s.attackFee)} SUI`);
        printKeyValue('Prize Pool', `${formatSui(s.prizePool)} SUI`);
        printKeyValue('Total Attacks', String(s.totalAttacks));
        printKeyValue('Breaches', String(s.successfulBreaches));
        if (s.systemPrompt) {
          printBlank();
          printKeyValue('System Prompt', '');
          printLine(`  ${pc.dim(s.systemPrompt.slice(0, 500))}`);
        }
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

  sentinel
    .command('attack')
    .description('Attack a sentinel with a prompt (costs SUI)')
    .argument('<id>', 'Sentinel object ID or agent ID')
    .argument('[prompt]', 'Attack prompt')
    .option('--fee <sui>', 'Override attack fee in SUI')
    .option('--key <path>', 'Key file path')
    .action(async (id: string, prompt: string | undefined, opts: { fee?: string; key?: string }) => {
      try {
        if (!prompt) {
          throw new Error('Prompt is required. Usage: t2000 sentinel attack <id> "your prompt"');
        }

        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        const feeMist = opts.fee
          ? BigInt(Math.round(parseFloat(opts.fee) * Number(MIST_PER_SUI)))
          : undefined;

        if (isJsonMode()) {
          const result = await agent.sentinelAttack(id, prompt, feeMist);
          printJson({
            ...result,
            verdict: {
              ...result.verdict,
            },
          });
          return;
        }

        printBlank();
        printLine(`  ${pc.dim('⏳')} Requesting attack...`);

        const result = await agent.sentinelAttack(id, prompt, feeMist);

        printBlank();
        if (result.won) {
          printSuccess(`BREACHED! (score: ${result.verdict.score}/100)`);
        } else {
          printLine(`  ${pc.red('✗')} DEFENDED (score: ${result.verdict.score}/100)`);
        }

        printBlank();
        printKeyValue('Agent', result.verdict.agentResponse.slice(0, 200));
        printKeyValue('Jury', result.verdict.juryResponse.slice(0, 200));
        if (result.verdict.funResponse) {
          printKeyValue('Fun', result.verdict.funResponse.slice(0, 200));
        }
        printBlank();
        printKeyValue('Fee Paid', `${result.feePaid} SUI`);
        printKeyValue('Request Tx', explorerUrl(result.requestTx));
        printKeyValue('Settle Tx', explorerUrl(result.settleTx));
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
