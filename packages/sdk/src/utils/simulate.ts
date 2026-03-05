import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { T2000Error } from '../errors.js';
import { mapMoveAbortCode } from '../errors.js';

export interface SimulationResult {
  success: boolean;
  gasEstimateSui: number;
  error?: {
    moveAbortCode?: number;
    moveModule?: string;
    reason: string;
    rawError: string;
  };
}

export async function simulateTransaction(
  client: SuiJsonRpcClient,
  tx: Transaction,
  sender: string,
): Promise<SimulationResult> {
  tx.setSender(sender);

  try {
    const txBytes = await tx.build({ client });
    const dryRun = await client.dryRunTransactionBlock({
      transactionBlock: Buffer.from(txBytes).toString('base64'),
    });

    const status = dryRun.effects?.status;
    const gasUsed = dryRun.effects?.gasUsed;

    const gasEstimateSui = gasUsed
      ? (Number(gasUsed.computationCost) +
          Number(gasUsed.storageCost) -
          Number(gasUsed.storageRebate)) / 1e9
      : 0;

    if (status?.status === 'failure') {
      const rawError = status.error ?? 'Unknown simulation error';
      const parsed = parseMoveAbort(rawError);

      return {
        success: false,
        gasEstimateSui,
        error: {
          moveAbortCode: parsed.abortCode,
          moveModule: parsed.module,
          reason: parsed.reason,
          rawError,
        },
      };
    }

    return { success: true, gasEstimateSui };
  } catch (err) {
    const rawError = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      gasEstimateSui: 0,
      error: {
        reason: 'Simulation failed: ' + rawError,
        rawError,
      },
    };
  }
}

export function throwIfSimulationFailed(sim: SimulationResult): void {
  if (sim.success) return;

  throw new T2000Error(
    'SIMULATION_FAILED',
    sim.error?.reason ?? 'Transaction simulation failed',
    {
      moveAbortCode: sim.error?.moveAbortCode,
      moveModule: sim.error?.moveModule,
      reason: sim.error?.reason,
      rawError: sim.error?.rawError,
    },
  );
}

function parseMoveAbort(errorStr: string): {
  abortCode?: number;
  module?: string;
  reason: string;
} {
  // Pattern: MoveAbort(MoveLocation { module: ModuleId { ... name: "module" }, ... }, code)
  const abortMatch = errorStr.match(/MoveAbort\([^,]*,\s*(\d+)\)/);
  const moduleMatch = errorStr.match(/name:\s*Identifier\("([^"]+)"\)/);

  if (abortMatch) {
    const code = parseInt(abortMatch[1], 10);
    const module = moduleMatch?.[1];
    const reason = mapMoveAbortCode(code);
    return { abortCode: code, module, reason };
  }

  // Pattern: MovePrimitiveRuntimeError
  if (errorStr.includes('MovePrimitiveRuntimeError')) {
    const module = moduleMatch?.[1];
    return {
      module,
      reason: `Move runtime error in ${module ?? 'unknown'} module`,
    };
  }

  return { reason: errorStr };
}
