import type { Command } from 'commander';
import { T2000, MIST_PER_SUI } from '@t2000/sdk';
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

        sentinels.forEach((s) => {
          const pool = `${formatSui(s.prizePool)} SUI`.padEnd(12);
          const fee = `${formatSui(s.attackFee)} SUI`.padEnd(12);
          printLine(`  ${s.name}`);
          printLine(`  ${pc.dim(`Pool: ${pool}Fee: ${fee}Attacks: ${s.totalAttacks}`)}`);
          printLine(`  ${pc.dim(s.objectId)}`);
          printBlank();
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
    .argument('<id>', 'Sentinel object ID')
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
    .argument('<id>', 'Sentinel object ID')
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
