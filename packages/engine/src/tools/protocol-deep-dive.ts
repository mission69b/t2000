import { z } from 'zod';
import { buildTool } from '../tool.js';

const LLAMA_API = 'https://api.llama.fi';

const inputSchema = z.object({
  protocol: z.string().describe('Protocol slug (e.g. "navi-protocol", "cetus", "scallop-lend")'),
});

interface ProtocolProfile {
  name: string;
  slug: string;
  category: string;
  chains: string[];
  tvl: number;
  tvlChange1d: number;
  tvlChange7d: number;
  tvlChange30d: number;
  mcap: number | null;
  fees24h: number | null;
  revenue24h: number | null;
  audits: string[];
  url: string;
  twitter: string | null;
  riskFactors: string[];
  safetyScore: string;
}

export const protocolDeepDiveTool = buildTool({
  name: 'protocol_deep_dive',
  description:
    'Get a comprehensive safety and financial profile of a DeFi protocol. Includes TVL trends, revenue, audit status, and risk assessment. Use when users ask "is X safe?" or "tell me about protocol Y".',
  inputSchema,
  jsonSchema: {
    type: 'object',
    properties: {
      protocol: { type: 'string', description: 'Protocol slug (e.g. "navi-protocol", "cetus")' },
    },
    required: ['protocol'],
  },
  isReadOnly: true,
  async call(input) {
    const slug = input.protocol.toLowerCase().replace(/\s+/g, '-');

    const [protocolRes, feesRes] = await Promise.allSettled([
      fetch(`${LLAMA_API}/protocol/${slug}`, { signal: AbortSignal.timeout(10_000) }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      fetch(`${LLAMA_API}/summary/fees/${slug}?dataType=dailyFees`, { signal: AbortSignal.timeout(8_000) }).then((r) => {
        if (!r.ok) return null;
        return r.json();
      }),
    ]);

    if (protocolRes.status === 'rejected') {
      throw new Error(`Protocol "${slug}" not found on DefiLlama.`);
    }

    const proto = protocolRes.value as Record<string, unknown>;

    const tvl = Number(proto.tvl ?? 0);
    const tvlChange1d = Number((proto.change_1d as number) ?? 0);
    const tvlChange7d = Number((proto.change_7d as number) ?? 0);
    const tvlChange30d = Number((proto.change_1m as number) ?? 0);
    const chains = (proto.chains ?? []) as string[];
    const category = (proto.category ?? 'Unknown') as string;
    const audits = (proto.audits ?? proto.audit_links ?? []) as string[];
    const auditNote = (proto.audit_note ?? proto.audits) as string | undefined;

    let fees24h: number | null = null;
    let revenue24h: number | null = null;
    if (feesRes.status === 'fulfilled' && feesRes.value) {
      const feesData = feesRes.value as Record<string, unknown>;
      fees24h = feesData.total24h != null ? Number(feesData.total24h) : null;
      revenue24h = feesData.totalRevenue24h != null ? Number(feesData.totalRevenue24h) : null;
    }

    const riskFactors: string[] = [];

    if (tvl < 1_000_000) riskFactors.push('TVL under $1M — low liquidity risk');
    if (tvl < 10_000_000) riskFactors.push('TVL under $10M — moderate liquidity');
    if (tvlChange7d < -15) riskFactors.push(`TVL dropped ${tvlChange7d.toFixed(1)}% in 7 days`);
    if (chains.length === 1) riskFactors.push('Single-chain deployment');
    if (!audits.length && !auditNote) riskFactors.push('No published audits found');
    if (audits.length > 0) riskFactors.push(`${audits.length} audit(s) on file`);

    let safetyScore: string;
    if (tvl > 100_000_000 && audits.length > 0 && tvlChange7d > -10) {
      safetyScore = 'High — established protocol with audits and significant TVL';
    } else if (tvl > 10_000_000 && tvlChange7d > -20) {
      safetyScore = 'Moderate — decent TVL, use with caution';
    } else {
      safetyScore = 'Low — small or declining TVL, proceed carefully';
    }

    const result: ProtocolProfile = {
      name: (proto.name ?? slug) as string,
      slug,
      category,
      chains,
      tvl,
      tvlChange1d,
      tvlChange7d,
      tvlChange30d,
      mcap: proto.mcap ? Number(proto.mcap) : null,
      fees24h,
      revenue24h,
      audits: typeof auditNote === 'string' ? [auditNote] : audits.map(String),
      url: (proto.url ?? '') as string,
      twitter: (proto.twitter ?? null) as string | null,
      riskFactors,
      safetyScore,
    };

    const tvlStr = tvl > 1e9 ? `$${(tvl / 1e9).toFixed(2)}B` : `$${(tvl / 1e6).toFixed(1)}M`;
    const feesStr = fees24h != null ? ` | Fees 24h: $${fees24h.toLocaleString()}` : '';

    return {
      data: result,
      displayText: `**${result.name}** (${category})\nTVL: ${tvlStr} (7d: ${tvlChange7d > 0 ? '+' : ''}${tvlChange7d.toFixed(1)}%)${feesStr}\nChains: ${chains.join(', ')}\nSafety: ${safetyScore}\nRisks: ${riskFactors.join('; ')}`,
    };
  },
});
