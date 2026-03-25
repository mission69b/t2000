export type SmartCardType =
  | 'rewards'
  | 'idle-funds'
  | 'better-rate'
  | 'overnight-earnings'
  | 'received-funds'
  | 'risk'
  | 'session-expiry'
  | 'all-good';

export interface SmartCardData {
  type: SmartCardType;
  icon: string;
  title: string;
  body: string;
  actions: SmartCardAction[];
  dismissible?: boolean;
}

export interface SmartCardAction {
  label: string;
  variant: 'primary' | 'secondary';
  chipFlow?: string;
}

export interface AccountState {
  cash: number;
  savings: number;
  borrows: number;
  savingsRate: number;
  pendingRewards: number;
  bestAlternativeRate?: { protocol: string; rate: number };
  currentRate?: number;
  overnightEarnings?: number;
  isFirstOpenToday?: boolean;
  healthFactor?: number;
  sessionExpiringSoon?: boolean;
  recentIncoming?: { amount: number; asset: string; from: string; timestamp: number }[];
}

/**
 * Pure function: account state → which smart cards to show.
 * Returns 0-N cards in priority order.
 */
export function deriveSmartCards(state: AccountState): SmartCardData[] {
  const cards: SmartCardData[] = [];

  if (state.sessionExpiringSoon) {
    cards.push({
      type: 'session-expiry',
      icon: '⚠',
      title: 'Session expires soon',
      body: 'Your session expires within 24 hours. Refresh to stay signed in.',
      actions: [{ label: 'Refresh now', variant: 'primary', chipFlow: 'refresh-session' }],
    });
  }

  if (state.recentIncoming && state.recentIncoming.length > 0) {
    const fiveMinAgo = Date.now() - 5 * 60_000;
    const recent = state.recentIncoming.filter((tx) => tx.timestamp > fiveMinAgo);
    if (recent.length > 0) {
      const total = recent.reduce((s, tx) => s + tx.amount, 0);
      const fromLabel = recent.length === 1 && recent[0].from
        ? ` from ${recent[0].from.slice(0, 6)}...${recent[0].from.slice(-4)}`
        : '';
      cards.push({
        type: 'received-funds',
        icon: '💸',
        title: `You received $${total.toFixed(2)}${fromLabel}`,
        body: recent.length > 1 ? `${recent.length} incoming transfers` : '',
        actions: [{ label: 'View history', variant: 'primary', chipFlow: 'history' }],
        dismissible: true,
      });
    }
  }

  if (state.isFirstOpenToday && state.overnightEarnings && state.overnightEarnings > 0) {
    cards.push({
      type: 'overnight-earnings',
      icon: '💵',
      title: `You earned $${state.overnightEarnings.toFixed(2)} overnight`,
      body: '',
      actions: [],
    });
  }

  if (state.pendingRewards > 0) {
    cards.push({
      type: 'rewards',
      icon: '🏆',
      title: `$${state.pendingRewards.toFixed(2)} in rewards`,
      body: '',
      actions: [{ label: `Claim $${state.pendingRewards.toFixed(2)}`, variant: 'primary', chipFlow: 'claim-rewards' }],
    });
  }

  if (state.cash > 5) {
    const monthlyEarnings = (state.cash * (state.savingsRate / 100)) / 12;
    cards.push({
      type: 'idle-funds',
      icon: '💰',
      title: `$${Math.floor(state.cash)} idle — could earn $${monthlyEarnings.toFixed(2)}/mo at ${state.savingsRate.toFixed(1)}%`,
      body: '',
      actions: [{ label: 'Move to savings', variant: 'primary', chipFlow: 'save-all' }],
    });
  }

  if (state.bestAlternativeRate && state.currentRate) {
    const diff = state.bestAlternativeRate.rate - state.currentRate;
    if (diff > 0.3 && state.savings > 0) {
      const extraMonthly = (state.savings * (diff / 100)) / 12;
      cards.push({
        type: 'better-rate',
        icon: '📈',
        title: `${state.bestAlternativeRate.protocol} is offering ${state.bestAlternativeRate.rate.toFixed(1)}% vs your ${state.currentRate.toFixed(1)}%`,
        body: `That's $${extraMonthly.toFixed(2)}/mo more on your $${Math.floor(state.savings)}.`,
        actions: [
          { label: `Switch to ${state.bestAlternativeRate.protocol}`, variant: 'primary', chipFlow: 'rebalance' },
          { label: 'Dismiss', variant: 'secondary' },
        ],
        dismissible: true,
      });
    }
  }

  if (state.healthFactor !== undefined && state.healthFactor < 1.5 && state.healthFactor > 0) {
    cards.push({
      type: 'risk',
      icon: '⚠',
      title: 'Your position is getting risky',
      body: 'Repay a little to stay safe.',
      actions: [
        { label: 'Repay $50', variant: 'primary', chipFlow: 'repay' },
        { label: 'Why?', variant: 'secondary', chipFlow: 'risk-explain' },
      ],
    });
  }

  if (state.borrows > 0) {
    const debtActions: SmartCardAction[] = [
      { label: 'Repay', variant: 'primary', chipFlow: 'repay' },
    ];
    const hfStr = state.healthFactor !== undefined && state.healthFactor !== Infinity
      ? ` · HF ${state.healthFactor.toFixed(1)}`
      : '';
    cards.push({
      type: 'all-good',
      icon: '📊',
      title: `$${Math.floor(state.borrows)} debt outstanding${hfStr}`,
      body: '',
      actions: debtActions,
    });
  }

  if (cards.length === 0) {
    if (state.cash === 0 && state.savings === 0) {
      cards.push({
        type: 'all-good',
        icon: '👋',
        title: 'Welcome to t2000',
        body: 'Add funds to get started. Send SUI from any exchange (Binance, Coinbase) or any Sui wallet to your address.',
        actions: [{ label: 'Show my address', variant: 'primary', chipFlow: 'receive' }],
      });
    } else {
      const parts: string[] = [];
      if (state.savingsRate > 0) parts.push(`Earning ${state.savingsRate.toFixed(1)}% on $${Math.floor(state.savings)}`);
      cards.push({
        type: 'all-good',
        icon: '✅',
        title: 'Your account is working for you.',
        body: parts.join(' · '),
        actions: [],
      });
    }
  }

  return cards;
}
