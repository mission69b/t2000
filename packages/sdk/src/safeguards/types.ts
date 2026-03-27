export interface SafeguardConfig {
  locked: boolean;
  maxPerTx: number;
  maxDailySend: number;
  dailyUsed: number;
  dailyResetDate: string;
  maxLeverage?: number;
  maxPositionSize?: number;
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
    | 'invest'
    | 'trade';
  amount?: number;
}

export const OUTBOUND_OPS = new Set<TxMetadata['operation']>([
  'send',
  'pay',
]);

export const DEFAULT_SAFEGUARD_CONFIG: SafeguardConfig = {
  locked: false,
  maxPerTx: 0,
  maxDailySend: 0,
  dailyUsed: 0,
  dailyResetDate: '',
};
