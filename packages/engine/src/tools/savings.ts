import { z } from 'zod';
import { fetchSavings } from '../navi-reads.js';
import { buildTool } from '../tool.js';
import { hasNaviMcpGlobal, getMcpManager, requireAgent } from './utils.js';
import type { PositionEntry, SavingsResult } from '../navi-transforms.js';
import type { ServerPositionData } from '../types.js';

const DUST_THRESHOLD_USD = 0.01;
const SUI_ADDRESS_REGEX = /^0x[a-fA-F0-9]{1,64}$/;

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

function formatSavingsDisplay(
  result: SavingsResult,
  isSelfQuery: boolean = true,
  address?: string,
): string {
  const { positions, earnings, fundStatus } = result;
  const supplies = positions.filter((p) => p.type === 'supply');
  const borrows = positions.filter((p) => p.type === 'borrow');

  const subjectPrefix = isSelfQuery || !address
    ? ''
    : `${address.slice(0, 6)}…${address.slice(-4)} — `;

  const lines: string[] = [];
  if (supplies.length > 0) {
    lines.push(`${subjectPrefix}Savings: $${fundStatus.supplied.toFixed(2)} at ${(earnings.currentApy * 100).toFixed(2)}% blended APY`);
    for (const s of supplies) {
      lines.push(`  ${s.symbol}: ${s.amount.toFixed(s.amount < 1 ? 6 : 2)} ($${s.valueUsd.toFixed(2)}) at ${(s.apy * 100).toFixed(2)}% APY`);
    }
  } else {
    lines.push(`${subjectPrefix}No savings positions.`);
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
    'Get detailed savings positions and earnings for the signed-in user OR any public Sui address: current deposits by protocol, APY, total yield earned, daily earning rate, and projected monthly returns. Pass `address` to inspect a contact / watched / public wallet; defaults to the signed-in user when omitted.',
  inputSchema: z.object({
    address: z
      .string()
      .regex(SUI_ADDRESS_REGEX)
      .optional()
      .describe('Sui address to inspect (defaults to the signed-in wallet)'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        pattern: '^0x[a-fA-F0-9]{1,64}$',
        description: 'Sui address to inspect (defaults to the signed-in wallet)',
      },
    },
    required: [],
  },
  isReadOnly: true,
  // [v1.5.1] NAVI deposits change on save_deposit / withdraw / claim.
  // Each call reflects a fresh on-chain snapshot — never dedupe.
  cacheable: false,

  async call(input, context) {
    /**
     * [v0.49] Address-scope: tool now accepts an optional `address` param
     * so the LLM can inspect any public Sui wallet's NAVI deposits.
     * Pre-v0.49 the tool only ever queried `context.walletAddress`,
     * silently returning the signed-in user's positions for "How much
     * has funkii saved?" type questions. Falls back to
     * `context.walletAddress` when the param is absent. Stamps `address`
     * + `isSelfQuery` on the result.
     */
    const targetAddress = input.address ?? context.walletAddress;
    const isSelfQuery =
      !!context.walletAddress &&
      !!targetAddress &&
      targetAddress.toLowerCase() === context.walletAddress.toLowerCase();

    if (context.positionFetcher && targetAddress) {
      const sp = await context.positionFetcher(targetAddress);
      const result = buildSavingsFromPositions(sp);
      const stamped = { ...result, address: targetAddress, isSelfQuery };
      return { data: stamped, displayText: formatSavingsDisplay(result, isSelfQuery, targetAddress) };
    }

    if (hasNaviMcpGlobal(context) && targetAddress) {
      const savings = await fetchSavings(getMcpManager(context), targetAddress);
      savings.positions = savings.positions.filter((p) => p.valueUsd >= DUST_THRESHOLD_USD);
      const stamped = { ...savings, address: targetAddress, isSelfQuery };
      return { data: stamped, displayText: formatSavingsDisplay(savings, isSelfQuery, targetAddress) };
    }

    if (
      input.address &&
      context.walletAddress &&
      input.address.toLowerCase() !== context.walletAddress.toLowerCase()
    ) {
      throw new Error(
        `Cannot inspect ${input.address.slice(0, 8)}… without NAVI MCP or a positionFetcher. Configure NAVI MCP to enable third-party address reads.`,
      );
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

    const stamped = { ...result, address: targetAddress ?? '', isSelfQuery: true };
    return { data: stamped, displayText: formatSavingsDisplay(result, true, undefined) };
  },
});
