import { z } from 'zod';
import { fetchSavings } from '../navi-reads.js';
import { buildTool } from '../tool.js';
import { hasNaviMcp, getMcpManager, getWalletAddress, requireAgent } from './utils.js';
import type { PositionEntry, SavingsResult } from '../navi-transforms.js';
import type { ServerPositionData } from '../types.js';

const DUST_THRESHOLD_USD = 0.01;

function buildSavingsFromPositions(sp: ServerPositionData): SavingsResult {
  const positions: PositionEntry[] = [
    ...sp.supplies
      .filter((s) => s.amountUsd >= DUST_THRESHOLD_USD)
      .map((s) => ({
        protocol: s.protocol,
        type: 'supply' as const,
        symbol: s.asset,
        amount: s.amount,
        valueUsd: s.amountUsd,
        apy: s.apy,
        liquidationThreshold: 0,
      })),
    ...sp.borrows_detail
      .filter((b) => b.amountUsd >= DUST_THRESHOLD_USD)
      .map((b) => ({
        protocol: b.protocol,
        type: 'borrow' as const,
        symbol: b.asset,
        amount: b.amount,
        valueUsd: b.amountUsd,
        apy: b.apy,
        liquidationThreshold: 0,
      })),
  ];

  const supplied = sp.savings;
  const weightedApy = supplied > 0 ? sp.savingsRate : 0;
  const dailyEarning = (supplied * weightedApy) / 365;

  return {
    positions,
    earnings: {
      totalYieldEarned: 0,
      currentApy: weightedApy,
      dailyEarning,
      supplied,
    },
    fundStatus: {
      supplied,
      apy: weightedApy,
      earnedToday: dailyEarning,
      earnedAllTime: 0,
      projectedMonthly: dailyEarning * 30,
    },
  };
}

function formatSavingsDisplay(result: SavingsResult): string {
  const { positions, earnings, fundStatus } = result;
  const supplies = positions.filter((p) => p.type === 'supply');
  const borrows = positions.filter((p) => p.type === 'borrow');

  const lines: string[] = [];
  if (supplies.length > 0) {
    lines.push(`Savings: $${fundStatus.supplied.toFixed(2)} at ${(earnings.currentApy * 100).toFixed(2)}% blended APY`);
    for (const s of supplies) {
      lines.push(`  ${s.symbol}: ${s.amount.toFixed(s.amount < 1 ? 6 : 2)} ($${s.valueUsd.toFixed(2)}) at ${(s.apy * 100).toFixed(2)}% APY`);
    }
  } else {
    lines.push('No savings positions.');
  }
  if (borrows.length > 0) {
    const totalDebt = borrows.reduce((s, b) => s + b.valueUsd, 0);
    lines.push(`Debt: $${totalDebt.toFixed(2)}`);
  }
  lines.push(`Daily earnings: $${fundStatus.earnedToday.toFixed(4)}`);
  lines.push(`Monthly projected: $${fundStatus.projectedMonthly.toFixed(4)}`);
  return lines.join('\n');
}

export const savingsInfoTool = buildTool({
  name: 'savings_info',
  description:
    'Get detailed savings positions and earnings: current deposits by protocol, APY, total yield earned, daily earning rate, and projected monthly returns.',
  inputSchema: z.object({}),
  jsonSchema: { type: 'object', properties: {}, required: [] },
  isReadOnly: true,

  async call(_input, context) {
    if (context.positionFetcher && context.walletAddress) {
      const sp = await context.positionFetcher(context.walletAddress);
      const result = buildSavingsFromPositions(sp);
      return { data: result, displayText: formatSavingsDisplay(result) };
    }

    if (hasNaviMcp(context)) {
      const savings = await fetchSavings(
        getMcpManager(context),
        getWalletAddress(context),
      );
      savings.positions = savings.positions.filter((p) => p.valueUsd >= DUST_THRESHOLD_USD);
      return { data: savings, displayText: formatSavingsDisplay(savings) };
    }

    const agent = requireAgent(context);
    const [posResult, earnings, fundStatus] = await Promise.all([
      agent.positions(),
      agent.earnings(),
      agent.fundStatus(),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const positions = (posResult.positions ?? []).map((p: any) => ({
      protocol: (p.protocol ?? 'navi') as string,
      type: p.type === 'borrow' ? ('borrow' as const) : ('supply' as const),
      symbol: ((p.asset ?? p.symbol) ?? 'UNKNOWN') as string,
      amount: (p.amount ?? 0) as number,
      valueUsd: ((p.amountUsd ?? p.valueUsd) ?? 0) as number,
      apy: (p.apy ?? 0) as number,
      liquidationThreshold: (p.liquidationThreshold ?? 0) as number,
    })).filter((p: PositionEntry) => p.valueUsd >= DUST_THRESHOLD_USD);

    const result: SavingsResult = {
      positions,
      earnings: {
        totalYieldEarned: earnings.totalYieldEarned,
        currentApy: earnings.currentApy,
        dailyEarning: earnings.dailyEarning,
        supplied: earnings.supplied,
      },
      fundStatus: {
        supplied: fundStatus.supplied,
        apy: fundStatus.apy,
        earnedToday: fundStatus.earnedToday,
        earnedAllTime: fundStatus.earnedAllTime,
        projectedMonthly: fundStatus.projectedMonthly,
      },
    };

    return { data: result, displayText: formatSavingsDisplay(result) };
  },
});
