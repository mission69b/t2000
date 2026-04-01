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

  async call(_input, context) {
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
