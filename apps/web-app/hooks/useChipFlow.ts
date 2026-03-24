'use client';

import { useCallback, useState } from 'react';

export type ChipFlowPhase =
  | 'idle'
  | 'l2-chips'         // showing sub-chips (amount, recipient, etc.)
  | 'confirming'       // showing confirmation card
  | 'executing'        // transaction in progress
  | 'result';          // showing result

export interface ChipFlowState {
  phase: ChipFlowPhase;
  flow: string | null;           // 'save', 'send', 'withdraw', 'borrow', 'repay', etc.
  subFlow: string | null;        // recipient name, asset type, etc.
  amount: number | null;
  recipient: string | null;
  message: string | null;        // AI context message
  result: ChipFlowResult | null;
  error: string | null;
}

export interface ChipFlowResult {
  success: boolean;
  title: string;
  details: string;
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
  message: null,
  result: null,
  error: null,
};

export interface FlowContext {
  checking?: number;
  savings?: number;
  borrows?: number;
  savingsRate?: number;
  maxBorrow?: number;
}

export function useChipFlow() {
  const [state, setState] = useState<ChipFlowState>(INITIAL_STATE);

  const startFlow = useCallback((flow: string, context?: FlowContext) => {
    setState({
      ...INITIAL_STATE,
      phase: 'l2-chips',
      flow,
      message: getFlowMessage(flow, context),
    });
  }, []);

  const selectAmount = useCallback((amount: number) => {
    setState((prev) => ({
      ...prev,
      amount,
      phase: 'confirming',
    }));
  }, []);

  const selectRecipient = useCallback((recipient: string, label?: string, checking?: number) => {
    const available = checking !== undefined ? `$${Math.floor(checking)} available` : 'checking balance';
    setState((prev) => ({
      ...prev,
      recipient,
      subFlow: label ?? recipient,
      message: `How much to ${label ?? truncate(recipient)}?\n${available}`,
    }));
  }, []);

  const confirm = useCallback(() => {
    setState((prev) => ({
      ...prev,
      phase: 'executing',
    }));
  }, []);

  const setResult = useCallback((result: ChipFlowResult) => {
    setState((prev) => ({
      ...prev,
      phase: 'result',
      result,
      error: null,
    }));
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

function getFlowMessage(flow: string, ctx?: FlowContext): string {
  const fmt = (n?: number) => n !== undefined ? `$${Math.floor(n)}` : '';
  switch (flow) {
    case 'save': {
      const rate = ctx?.savingsRate ? ` ${ctx.savingsRate.toFixed(1)}%` : '';
      const avail = ctx?.checking ? ` You have ${fmt(ctx.checking)} available.` : '';
      return `Save to earn${rate}.${avail}\nChoose an amount:`;
    }
    case 'send': return 'Who do you want to send to?';
    case 'withdraw': {
      const saved = ctx?.savings ? ` You have ${fmt(ctx.savings)} saved.` : '';
      return `Withdraw from savings.${saved}\nChoose an amount:`;
    }
    case 'borrow': {
      const max = ctx?.maxBorrow ? ` You can borrow up to ${fmt(ctx.maxBorrow)}.` : '';
      return `Borrow against your savings.${max}\nChoose an amount:`;
    }
    case 'repay': {
      const debt = ctx?.borrows ? ` Outstanding debt: ${fmt(ctx.borrows)}.` : '';
      return `Repay your loan.${debt}\nChoose an amount:`;
    }
    default: return 'Choose an option:';
  }
}
