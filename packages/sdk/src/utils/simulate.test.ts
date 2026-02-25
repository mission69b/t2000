import { describe, it, expect } from 'vitest';
import { throwIfSimulationFailed, type SimulationResult } from './simulate.js';
import { T2000Error } from '../errors.js';

describe('simulate utilities', () => {
  describe('throwIfSimulationFailed', () => {
    it('does not throw for successful simulations', () => {
      const sim: SimulationResult = { success: true, gasEstimateSui: 0.01 };
      expect(() => throwIfSimulationFailed(sim)).not.toThrow();
    });

    it('throws T2000Error for failed simulations', () => {
      const sim: SimulationResult = {
        success: false,
        gasEstimateSui: 0,
        error: {
          reason: 'Protocol is paused',
          rawError: 'MoveAbort(..., 1)',
          moveAbortCode: 1,
          moveModule: 't2000_core',
        },
      };
      expect(() => throwIfSimulationFailed(sim)).toThrow(T2000Error);
    });

    it('throws with SIMULATION_FAILED code', () => {
      const sim: SimulationResult = {
        success: false,
        gasEstimateSui: 0,
        error: {
          reason: 'test failure',
          rawError: 'raw',
        },
      };
      try {
        throwIfSimulationFailed(sim);
      } catch (e) {
        expect(e).toBeInstanceOf(T2000Error);
        expect((e as T2000Error).code).toBe('SIMULATION_FAILED');
        expect((e as T2000Error).message).toBe('test failure');
      }
    });

    it('includes error metadata in thrown error', () => {
      const sim: SimulationResult = {
        success: false,
        gasEstimateSui: 0.005,
        error: {
          reason: 'Not authorized',
          rawError: 'MoveAbort(..., 6)',
          moveAbortCode: 6,
          moveModule: 't2000_core',
        },
      };
      try {
        throwIfSimulationFailed(sim);
      } catch (e) {
        const err = e as T2000Error;
        expect(err.data).toEqual({
          moveAbortCode: 6,
          moveModule: 't2000_core',
          reason: 'Not authorized',
          rawError: 'MoveAbort(..., 6)',
        });
      }
    });

    it('handles missing error details gracefully', () => {
      const sim: SimulationResult = {
        success: false,
        gasEstimateSui: 0,
      };
      try {
        throwIfSimulationFailed(sim);
      } catch (e) {
        expect(e).toBeInstanceOf(T2000Error);
        expect((e as T2000Error).message).toBe('Transaction simulation failed');
      }
    });
  });
});
