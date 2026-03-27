import { NextRequest, NextResponse } from 'next/server';
import { getRegistry } from '@/lib/protocol-registry';

export const runtime = 'nodejs';

interface SupplyEntry {
  asset: string;
  amount: number;
  amountUsd: number;
  apy: number;
  protocol: string;
  protocolId: string;
}

interface BorrowEntry {
  asset: string;
  amount: number;
  amountUsd: number;
  apy: number;
  protocol: string;
  protocolId: string;
}

/**
 * GET /api/positions?address=0x...
 *
 * Returns savings, borrows, rates, health factor, and max borrow across all lending protocols.
 */
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address');
  if (!address || !address.startsWith('0x')) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  try {
    const registry = getRegistry();
    const lendingAdapters = registry.listLending();

    const [allPositions, healthResults, rewardResults] = await Promise.all([
      registry.allPositions(address),
      Promise.allSettled(lendingAdapters.map((a) => a.getHealth(address))),
      Promise.allSettled(
        lendingAdapters
          .filter((a) => !!a.getPendingRewards)
          .map((a) => a.getPendingRewards!(address)),
      ),
    ]);

    let savings = 0;
    let borrows = 0;
    let weightedRateSum = 0;

    const supplies: SupplyEntry[] = [];
    const borrowList: BorrowEntry[] = [];

    for (const pos of allPositions) {
      for (const s of pos.positions.supplies) {
        const usd = s.amountUsd ?? s.amount;
        savings += usd;
        weightedRateSum += usd * s.apy;
        supplies.push({ asset: s.asset, amount: s.amount, amountUsd: usd, apy: s.apy, protocol: pos.protocol, protocolId: pos.protocolId });
      }
      for (const b of pos.positions.borrows) {
        const usd = b.amountUsd ?? b.amount;
        borrows += usd;
        borrowList.push({ asset: b.asset, amount: b.amount, amountUsd: usd, apy: b.apy, protocol: pos.protocol, protocolId: pos.protocolId });
      }
    }

    const savingsRate = savings > 0 ? weightedRateSum / savings : 0;

    type HealthResult = Awaited<ReturnType<typeof lendingAdapters[0]['getHealth']>>;
    const validHealths = healthResults
      .filter((h): h is PromiseFulfilledResult<HealthResult> => h.status === 'fulfilled')
      .map((h) => h.value);

    const finiteHFs = validHealths.filter((h) => h.healthFactor !== Infinity && isFinite(h.healthFactor));
    const healthFactor = finiteHFs.length > 0
      ? Math.min(...finiteHFs.map((h) => h.healthFactor))
      : null;
    const maxBorrow = validHealths.reduce((sum, h) => sum + (h.maxBorrow ?? 0), 0);

    type RewardResult = Awaited<ReturnType<NonNullable<typeof lendingAdapters[0]['getPendingRewards']>>>;
    const pendingRewards = rewardResults
      .filter((r): r is PromiseFulfilledResult<RewardResult> => r.status === 'fulfilled')
      .flatMap((r) => r.value)
      .reduce((sum, r) => sum + (r.estimatedValueUsd ?? 0), 0);

    return NextResponse.json({
      savings,
      borrows,
      savingsRate,
      healthFactor,
      maxBorrow,
      pendingRewards,
      supplies,
      borrows_detail: borrowList,
    });
  } catch {
    return NextResponse.json({ savings: 0, borrows: 0, savingsRate: 0, healthFactor: null, maxBorrow: 0, pendingRewards: 0 });
  }
}
