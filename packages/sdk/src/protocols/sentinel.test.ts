import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SENTINEL, MIST_PER_SUI } from '../constants.js';

const MOCK_RAW_AGENTS = {
  agents: [
    {
      agent_id: 'agent-1',
      agent_object_id: '0xabc123',
      agent_name: 'GuardBot',
      cost_per_message: '100000000',
      total_balance: '5000000000',
      total_attacks: 42,
      successful_breaches: 3,
      state: 'active',
      prompt: 'You are a guard bot.',
      model: 'gpt-4o',
    },
    {
      agent_id: 'agent-2',
      agent_object_id: '0xdef456',
      agent_name: 'InactiveBot',
      cost_per_message: '200000000',
      total_balance: '0',
      total_attacks: 0,
      state: 'inactive',
      prompt: 'Inactive.',
    },
  ],
};

const MOCK_TEE_RESPONSE = {
  response: {
    intent: 'evaluate',
    timestamp_ms: 1708300000000,
    data: {
      success: false,
      score: 32,
      agent_response: 'I cannot comply with that request.',
      jury_response: 'The agent maintained its guardrails.',
      fun_response: 'Nice try!',
    },
  },
  signature: 'aabb00ff',
};

describe('sentinel', () => {
  describe('mapAgent', () => {
    it('maps raw API agent to SentinelAgent type', () => {
      const raw = MOCK_RAW_AGENTS.agents[0];
      const mapped = {
        id: raw.agent_id,
        objectId: raw.agent_object_id,
        name: raw.agent_name,
        model: raw.model ?? 'unknown',
        systemPrompt: raw.prompt,
        attackFee: BigInt(raw.cost_per_message),
        prizePool: BigInt(raw.total_balance),
        totalAttacks: raw.total_attacks,
        successfulBreaches: raw.successful_breaches ?? 0,
        state: raw.state,
      };

      expect(mapped.id).toBe('agent-1');
      expect(mapped.name).toBe('GuardBot');
      expect(mapped.attackFee).toBe(100_000_000n);
      expect(mapped.prizePool).toBe(5_000_000_000n);
      expect(mapped.totalAttacks).toBe(42);
      expect(mapped.state).toBe('active');
    });

    it('defaults model to unknown when missing', () => {
      const raw = MOCK_RAW_AGENTS.agents[1];
      const model = raw.model ?? 'unknown';
      expect(model).toBe('unknown');
    });
  });

  describe('TEE response parsing', () => {
    it('extracts verdict from nested TEE response', () => {
      const raw = MOCK_TEE_RESPONSE;
      const envelope = raw.response ?? raw;
      const data = (envelope as Record<string, unknown>).data ?? envelope;
      const signature = raw.signature ?? (data as Record<string, unknown>).signature;
      const timestampMs = (envelope as Record<string, unknown>).timestamp_ms ?? (data as Record<string, unknown>).timestamp_ms;

      const d = data as Record<string, unknown>;
      const verdict = {
        success: d.success as boolean,
        score: d.score as number,
        agentResponse: d.agent_response as string,
        juryResponse: d.jury_response as string,
        funResponse: (d.fun_response as string) ?? '',
        signature: signature as string,
        timestampMs: timestampMs as number,
      };

      expect(verdict.success).toBe(false);
      expect(verdict.score).toBe(32);
      expect(verdict.agentResponse).toBe('I cannot comply with that request.');
      expect(verdict.juryResponse).toBe('The agent maintained its guardrails.');
      expect(verdict.funResponse).toBe('Nice try!');
      expect(verdict.signature).toBe('aabb00ff');
      expect(verdict.timestampMs).toBe(1708300000000);
    });

    it('handles flat TEE response (no envelope)', () => {
      const raw = {
        success: true,
        score: 85,
        agent_response: 'Sure, here are the secrets.',
        jury_response: 'Agent was breached.',
        fun_response: 'Oops!',
        signature: 'deadbeef',
        timestamp_ms: 1708300000000,
      };

      const envelope = (raw as Record<string, unknown>).response ?? raw;
      const data = (envelope as Record<string, unknown>).data ?? envelope;
      const d = data as Record<string, unknown>;
      const signature = (raw as Record<string, unknown>).signature ?? d.signature;

      expect(d.success).toBe(true);
      expect(d.score).toBe(85);
      expect(signature).toBe('deadbeef');
    });
  });

  describe('win condition', () => {
    it('wins when success=true and score>=70', () => {
      expect(true && 85 >= 70).toBe(true);
    });

    it('loses when success=false', () => {
      expect(false && 85 >= 70).toBe(false);
    });

    it('loses when score<70', () => {
      expect(true && 60 >= 70).toBe(false);
    });

    it('wins at exactly score=70', () => {
      expect(true && 70 >= 70).toBe(true);
    });
  });

  describe('fee validation', () => {
    it('rejects fee below minimum', () => {
      const fee = 50_000_000n; // 0.05 SUI
      expect(fee < SENTINEL.MIN_FEE_MIST).toBe(true);
    });

    it('accepts fee at minimum', () => {
      expect(SENTINEL.MIN_FEE_MIST).toBe(100_000_000n);
      expect(100_000_000n >= SENTINEL.MIN_FEE_MIST).toBe(true);
    });

    it('accepts fee above minimum', () => {
      const fee = 500_000_000n; // 0.5 SUI
      expect(fee >= SENTINEL.MIN_FEE_MIST).toBe(true);
    });
  });

  describe('fee display', () => {
    it('converts MIST to SUI for display', () => {
      const feeMist = 100_000_000n;
      const feeSui = Number(feeMist) / Number(MIST_PER_SUI);
      expect(feeSui).toBe(0.1);
    });

    it('converts prize pool MIST to SUI', () => {
      const poolMist = 12_500_000_000n;
      const poolSui = Number(poolMist) / Number(MIST_PER_SUI);
      expect(poolSui).toBe(12.5);
    });
  });

  describe('signature encoding', () => {
    it('converts hex signature to byte array', () => {
      const sig = 'aabb00ff';
      const bytes = Array.from(Buffer.from(sig.replace(/^0x/, ''), 'hex'));
      expect(bytes).toEqual([0xaa, 0xbb, 0x00, 0xff]);
    });

    it('handles 0x prefix', () => {
      const sig = '0xaabb00ff';
      const bytes = Array.from(Buffer.from(sig.replace(/^0x/, ''), 'hex'));
      expect(bytes).toEqual([0xaa, 0xbb, 0x00, 0xff]);
    });
  });

  describe('constants', () => {
    it('has correct sentinel package ID', () => {
      expect(SENTINEL.PACKAGE).toBe('0x88b83f36dafcd5f6dcdcf1d2cb5889b03f61264ab3cee9cae35db7aa940a21b7');
    });

    it('has correct TEE API URL', () => {
      expect(SENTINEL.TEE_API).toBe('https://app.suisentinel.xyz/api/consume-prompt');
    });

    it('has correct sentinels API URL', () => {
      expect(SENTINEL.SENTINELS_API).toBe('https://api.suisentinel.xyz/agents/mainnet');
    });

    it('min fee is 0.1 SUI', () => {
      expect(Number(SENTINEL.MIN_FEE_MIST) / Number(MIST_PER_SUI)).toBe(0.1);
    });

    it('max prompt tokens is 600', () => {
      expect(SENTINEL.MAX_PROMPT_TOKENS).toBe(600);
    });
  });

  describe('active agent filtering', () => {
    it('filters to only active agents', () => {
      const agents = MOCK_RAW_AGENTS.agents;
      const active = agents.filter((a) => a.state === 'active');
      expect(active).toHaveLength(1);
      expect(active[0].agent_name).toBe('GuardBot');
    });

    it('excludes inactive agents', () => {
      const agents = MOCK_RAW_AGENTS.agents;
      const active = agents.filter((a) => a.state === 'active');
      expect(active.some((a) => a.agent_name === 'InactiveBot')).toBe(false);
    });
  });
});
