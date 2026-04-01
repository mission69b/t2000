'use client';

import { useCallback, useState } from 'react';

export type ChipFlowPhase =
  | 'idle'
  | 'l2-chips'
  | 'confirming'
  | 'executing'
  | 'result';

export interface ChipFlowState {
  phase: ChipFlowPhase;
  flow: string | null;
  subFlow: string | null;
  amount: number | null;
  recipient: string | null;
  asset: string | null;
  protocol: string | null;
  message: string | null;
  result: ChipFlowResult | null;
  error: string | null;
}

export interface ChipFlowResult {
  success: boolean;
  title: string;
  details: string;
  txUrl?: string;
}

export interface ConfirmationData {
  title: string;
  details: { label: string; value: string }[];
}

const INITIAL_STATE: ChipFlowState = {
  phase: 'idle',
  flow: null,
  subFlow: null,
  amount: null,
  recipient: null,
  asset: null,
  protocol: null,
  message: null,
  result: null,
  error: null,
};

export interface FlowContext {
  cash?: number;
  savings?: number;
  borrows?: number;
  savingsRate?: number;
  maxBorrow?: number;
  protocol?: string;
  asset?: string;
}

export function useChipFlow() {
  const [state, setState] = useState<ChipFlowState>(INITIAL_STATE);

  const startFlow = useCallback((flow: string, context?: FlowContext) => {
    setState({
      ...INITIAL_STATE,
      phase: 'l2-chips',
      flow,
      protocol: context?.protocol ?? null,
      asset: context?.asset ?? null,
      message: getFlowMessage(flow, context),
    });
  }, []);

  const selectAmount = useCallback((amount: number) => {
    setState((prev) => ({ ...prev, amount, phase: 'confirming' }));
  }, []);

  const selectRecipient = useCallback((recipient: string, label?: string, cash?: number) => {
    const available = cash !== undefined ? `$${Math.floor(cash)} available` : 'cash balance';
    setState((prev) => ({
      ...prev,
      recipient,
      subFlow: label ?? recipient,
      message: `How much to ${label ?? truncate(recipient)}?\n${available}`,
    }));
  }, []);

  const confirm = useCallback(() => {
    setState((prev) => ({ ...prev, phase: 'executing' }));
  }, []);

  const setResult = useCallback((result: ChipFlowResult) => {
    setState((prev) => ({ ...prev, phase: 'result', result, error: null }));
  }, []);

  const setError = useCallback((error: string) => {
    setState((prev) => ({
      ...prev,
      phase: 'result',
      error,
      result: { success: false, title: 'Transaction failed', details: error },
    }));
  }, []);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return {
    state,
    startFlow,
    selectAmount,
    selectRecipient,
    confirm,
    setResult,
    setError,
    reset,
  };
}

function truncate(s: string): string {
  return s.length > 12 ? `${s.slice(0, 6)}...${s.slice(-4)}` : s;
}

function fmtAmount(n: number): string {
  if (n === 0) return '$0';
  if (n < 1) return `$${n.toFixed(2)}`;
  return `$${Math.floor(n)}`;
}

function getFlowMessage(flow: string, ctx?: FlowContext): string {
  switch (flow) {
    case 'save': {
      const rate = ctx?.savingsRate ? ` ${ctx.savingsRate.toFixed(1)}%` : '';
      const avail = ctx?.cash ? ` You have ${fmtAmount(ctx.cash)} available.` : '';
      return `Save to earn${rate}.${avail}\nChoose an amount:`;
    }
    case 'send': return 'Who do you want to send to?';
    case 'withdraw': {
      const saved = ctx?.savings ? ` You have ${fmtAmount(ctx.savings)} saved.` : '';
      return `Withdraw from savings.${saved}\nChoose an amount:`;
    }
    case 'borrow': {
      const max = ctx?.maxBorrow ? ` You can borrow up to ${fmtAmount(ctx.maxBorrow)}.` : '';
      return `Borrow against your savings.${max}\nChoose an amount:`;
    }
    case 'repay': {
      const debt = ctx?.borrows ? ` Outstanding debt: ${fmtAmount(ctx.borrows)}.` : '';
      return `Repay your loan.${debt}\nChoose an amount:`;
    }
    default: return 'Choose an option:';
  }
}
