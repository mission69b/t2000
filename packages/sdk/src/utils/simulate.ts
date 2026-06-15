import { Transaction } from '@mysten/sui/transactions';
import { T2000Error } from '../errors.js';
import { mapMoveAbortCode } from '../errors.js';
import type { SuiCoreClient } from './sui.js';

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
  client: SuiCoreClient,
  tx: Transaction,
  sender: string,
): Promise<SimulationResult> {
  tx.setSender(sender);

  try {
    // [gRPC migration] `core.simulateTransaction` replaces `dryRunTransactionBlock`.
    // It returns a discriminated union; effects.status is `{ success, error }`
    // where `error` is a structured `ExecutionError` (not the legacy raw string).
    const txBytes = await tx.build({ client });
    const sim = await client.core.simulateTransaction({
      transaction: txBytes,
      include: { effects: true },
    });
    const txn = sim.$kind === 'Transaction' ? sim.Transaction : sim.FailedTransaction;
    const effects = txn.effects;
    const gasUsed = effects?.gasUsed;

    const gasEstimateSui = gasUsed
      ? (Number(gasUsed.computationCost) +
          Number(gasUsed.storageCost) -
          Number(gasUsed.storageRebate)) / 1e9
      : 0;

    const errObj = effects && !effects.status.success ? effects.status.error : undefined;
    if (sim.$kind === 'FailedTransaction' || errObj) {
      const rawError = errObj?.message ?? 'Unknown simulation error';
      // Prefer the structured MoveAbort code; fall back to regex-parsing the
      // message for non-abort errors / pre-structured formats.
      const structuredAbort =
        errObj?.$kind === 'MoveAbort' ? Number(errObj.MoveAbort.abortCode) : undefined;
      const parsed = parseMoveAbort(rawError);
      const abortCode = structuredAbort ?? parsed.abortCode;

      return {
        success: false,
        gasEstimateSui,
        error: {
          moveAbortCode: abortCode,
          moveModule: parsed.module,
          reason: abortCode != null ? mapMoveAbortCode(abortCode) : parsed.reason,
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
