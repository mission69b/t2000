import type { Command } from 'commander';
import { T2000, MIST_PER_SUI, listSentinels } from '@t2000/sdk';
import type { SentinelAgent } from '@t2000/sdk';
import { resolvePin } from '../prompts.js';
import {
  printHeader,
  printKeyValue,
  printBlank,
  printJson,
  isJsonMode,
  handleError,
  printDivider,
  printLine,
  printInfo,
} from '../output.js';
import pc from 'picocolors';

function mistToSui(mist: bigint): number {
  return Number(mist) / Number(MIST_PER_SUI);
}

function bestTarget(sentinels: SentinelAgent[]): SentinelAgent | undefined {
  const withPool = sentinels.filter((s) => s.prizePool > 0n && s.attackFee > 0n);
  if (withPool.length === 0) return undefined;
  return withPool.sort((a, b) => {
    const ratioA = Number(a.prizePool) / Number(a.attackFee);
    const ratioB = Number(b.prizePool) / Number(b.attackFee);
    return ratioB - ratioA;
  })[0];
}

export function registerEarn(program: Command) {
  program
    .command('earn')
    .description('Show all earning opportunities — savings yield + sentinel bounties')
    .option('--key <path>', 'Key file path')
    .action(async (opts: { key?: string }) => {
      try {
        const pin = await resolvePin();
        const agent = await T2000.create({ pin, keyPath: opts.key });

        const [fundResult, sentinels] = await Promise.allSettled([
          agent.fundStatus(),
          listSentinels(),
        ]);

        const fund = fundResult.status === 'fulfilled' ? fundResult.value : null;
        const agents = sentinels.status === 'fulfilled' ? sentinels.value : null;

        if (isJsonMode()) {
          const best = agents ? bestTarget(agents) : undefined;
          const totalPool = agents
            ? agents.reduce((sum, s) => sum + mistToSui(s.prizePool), 0)
            : 0;
          const cheapest = agents
            ? Math.min(...agents.map((s) => mistToSui(s.attackFee)))
            : 0;

          printJson({
            savings: fund
              ? {
                  supplied: fund.supplied,
                  apy: fund.apy,
                  dailyEarning: fund.earnedToday,
                  earnedAllTime: fund.earnedAllTime,
                  projectedMonthly: fund.projectedMonthly,
                }
              : null,
            sentinel: agents
              ? {
                  activeSentinels: agents.length,
                  totalPrizePool: Number(totalPool.toFixed(2)),
                  cheapestFee: Number(cheapest.toFixed(2)),
                  bestTarget: best
                    ? {
                        name: best.name,
                        objectId: best.objectId,
                        prizePool: mistToSui(best.prizePool),
                        attackFee: mistToSui(best.attackFee),
                        ratio: Number((Number(best.prizePool) / Number(best.attackFee)).toFixed(1)),
                      }
                    : null,
                }
              : null,
          });
          return;
        }

        printHeader('Earning Opportunities');

        // --- Savings section ---
        printLine(pc.bold('SAVINGS') + pc.dim(' — Passive Yield'));
        printDivider();

        if (fund && fund.supplied > 0) {
          printKeyValue('Saved', `$${fund.supplied.toFixed(2)} USDC @ ${fund.apy.toFixed(1)}% APY`);
          printKeyValue('Daily Yield', `~$${fund.earnedToday.toFixed(4)}/day`);
          printKeyValue('All-time', `~$${fund.earnedAllTime.toFixed(4)}`);
          printKeyValue('Monthly Est', `~$${fund.projectedMonthly.toFixed(2)}/month`);
        } else if (fund) {
          printInfo('No savings yet — run `t2000 save <amount>` to start earning yield');
        } else {
          printInfo('Savings data unavailable');
        }

        printBlank();

        // --- Sentinel section ---
        printLine(pc.bold('SENTINEL BOUNTIES') + pc.dim(' — Active Red Teaming'));
        printDivider();

        if (agents && agents.length > 0) {
          const totalPool = agents.reduce((sum, s) => sum + mistToSui(s.prizePool), 0);
          const cheapest = Math.min(...agents.map((s) => mistToSui(s.attackFee)));
          const best = bestTarget(agents);

          printKeyValue('Active', `${agents.length} sentinels`);
          printKeyValue('Prize Pools', `${totalPool.toFixed(2)} SUI available`);
          printKeyValue('Cheapest Fee', `${cheapest.toFixed(2)} SUI`);

          if (best) {
            const ratio = (Number(best.prizePool) / Number(best.attackFee)).toFixed(1);
            printKeyValue('Best Target', `${best.name} — ${mistToSui(best.prizePool).toFixed(2)} SUI pool (${ratio}x ratio)`);
          }
        } else if (agents) {
          printInfo('No active bounties right now');
        } else {
          printInfo('Sentinel data unavailable');
        }

        printBlank();

        // --- Quick actions ---
        printLine(pc.bold('Quick Actions'));
        printDivider();
        printLine(`  ${pc.dim('t2000 save <amount>')}            Save USDC for yield`);
        printLine(`  ${pc.dim('t2000 sentinel list')}            Browse sentinel bounties`);
        printLine(`  ${pc.dim('t2000 sentinel attack <id>')}     Attack a sentinel`);
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
