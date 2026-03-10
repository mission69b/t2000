export interface SafeguardConfig {
  locked: boolean;
  maxPerTx: number;
  maxDailySend: number;
  dailyUsed: number;
  dailyResetDate: string;
}

export interface TxMetadata {
  operation:
    | 'send'
    | 'save'
    | 'withdraw'
    | 'borrow'
    | 'repay'
    | 'exchange'
    | 'rebalance'
    | 'pay'
    | 'sentinel';
  amount?: number;
}

export const OUTBOUND_OPS = new Set<TxMetadata['operation']>([
  'send',
  'pay',
  'sentinel',
]);

export const DEFAULT_SAFEGUARD_CONFIG: SafeguardConfig = {
  locked: false,
  maxPerTx: 0,
  maxDailySend: 0,
  dailyUsed: 0,
  dailyResetDate: '',
};
