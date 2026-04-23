import { z } from 'zod';
import { fetchHealthFactor } from '../navi-reads.js';
import { buildTool } from '../tool.js';
import { hasNaviMcp, getMcpManager, getWalletAddress, requireAgent } from './utils.js';

function hfStatus(hf: number): string {
  if (hf >= 2.0) return 'healthy';
  if (hf >= 1.5) return 'moderate';
  if (hf >= 1.2) return 'warning';
  return 'critical';
}

export const healthCheckTool = buildTool({
  name: 'health_check',
  description:
    'Check the lending health factor: current HF ratio, total supplied collateral, total borrowed, max additional borrow capacity, and liquidation threshold. HF < 1.5 is risky, < 1.2 is critical.',
  inputSchema: z.object({}),
  jsonSchema: { type: 'object', properties: {}, required: [] },
  isReadOnly: true,
  // [v1.5.1] Health factor changes on every borrow / repay / collateral
  // movement and even passively as oracle prices update. Never dedupe.
  cacheable: false,

  async call(_input, context) {
    if (context.positionFetcher && context.walletAddress) {
      const sp = await context.positionFetcher(context.walletAddress);
      const hfVal = sp.healthFactor ?? (sp.borrows > 0 ? 0 : Infinity);
      const status = hfStatus(hfVal);
      const displayHf = Number.isFinite(hfVal) ? hfVal.toFixed(2) : '∞';
      return {
        data: {
          healthFactor: hfVal,
          supplied: sp.savings,
          borrowed: sp.borrows,
          maxBorrow: sp.maxBorrow,
          liquidationThreshold: 0,
          status,
        },
        displayText: `Health Factor: ${displayHf} (${status})`,
      };
    }

    if (hasNaviMcp(context)) {
      const hf = await fetchHealthFactor(
        getMcpManager(context),
        getWalletAddress(context),
      );
      const status = hfStatus(hf.healthFactor);
      const displayHf = Number.isFinite(hf.healthFactor) ? hf.healthFactor.toFixed(2) : '∞';
      return {
        data: { ...hf, status },
        displayText: `Health Factor: ${displayHf} (${status})`,
      };
    }

    const agent = requireAgent(context);
    const hf = await agent.healthFactor();
    const status = hfStatus(hf.healthFactor);

    return {
      data: {
        healthFactor: hf.healthFactor,
        supplied: hf.supplied,
        borrowed: hf.borrowed,
        maxBorrow: hf.maxBorrow,
        liquidationThreshold: hf.liquidationThreshold,
        status,
      },
      displayText: `Health Factor: ${hf.healthFactor.toFixed(2)} (${status})`,
    };
  },
});
