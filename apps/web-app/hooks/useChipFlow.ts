'use client';

import { useCallback, useState } from 'react';

export type ChipFlowPhase =
  | 'idle'
  | 'asset-select'     // picking an asset (invest/swap)
  | 'l2-chips'         // showing sub-chips (amount, recipient, etc.)
  | 'quoting'          // fetching a swap quote
  | 'confirming'       // showing confirmation card
  | 'executing'        // transaction in progress
  | 'result';          // showing result

export interface SwapQuoteData {
  expectedOutput: number;
  priceImpact: number;
  poolPrice: number;
  fromAsset: string;
  toAsset: string;
  fromAmount: number;
}

export interface ChipFlowState {
  phase: ChipFlowPhase;
  flow: string | null;           // 'save', 'send', 'withdraw', 'borrow', 'repay', 'invest', 'swap'
  subFlow: string | null;        // recipient name, asset type, etc.
  amount: number | null;
  recipient: string | null;
  asset: string | null;          // selected asset (invest target or swap source)
  toAsset: string | null;        // swap destination asset
  quote: SwapQuoteData | null;   // swap/invest quote data
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
  asset: null,
  toAsset: null,
  quote: null,
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
    const needsAssetSelect = flow === 'invest' || flow === 'swap';
    setState({
      ...INITIAL_STATE,
      phase: needsAssetSelect ? 'asset-select' : 'l2-chips',
      flow,
      message: getFlowMessage(flow, context),
    });
  }, []);

  const selectAsset = useCallback((asset: string, context?: FlowContext) => {
    setState((prev) => {
      if (prev.flow === 'invest') {
        const avail = context?.checking ? ` You have ${fmtAmount(context.checking)} to invest.` : '';
        return {
          ...prev,
          asset,
          phase: 'l2-chips',
          message: `Invest in ${asset}.${avail}\nChoose an amount (USD):`,
        };
      }
      if (prev.flow === 'swap' && !prev.asset) {
        return {
          ...prev,
          asset,
          message: `Swap from ${asset}. What do you want to receive?`,
        };
      }
      if (prev.flow === 'swap' && prev.asset) {
        return {
          ...prev,
          toAsset: asset,
          phase: 'l2-chips',
          message: `Swap ${prev.asset} → ${asset}.\nChoose an amount:`,
        };
      }
      return prev;
    });
  }, []);

  const selectAmount = useCallback((amount: number) => {
    setState((prev) => ({
      ...prev,
      amount,
      phase: 'confirming',
    }));
  }, []);

  const setQuoting = useCallback((amount: number) => {
    setState((prev) => ({
      ...prev,
      amount,
      phase: 'quoting',
    }));
  }, []);

  const setQuote = useCallback((quote: SwapQuoteData) => {
    setState((prev) => ({
      ...prev,
      quote,
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
    selectAsset,
    selectAmount,
    setQuoting,
    setQuote,
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
      const avail = ctx?.checking ? ` You have ${fmtAmount(ctx.checking)} available.` : '';
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
    case 'invest':
      return 'What do you want to invest in?';
    case 'swap':
      return 'What do you want to swap from?';
    default: return 'Choose an option:';
  }
}
