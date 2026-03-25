import type { AccountState } from './smart-cards';

export type { AccountState };

export interface ContextualChip {
  id: string;
  icon: string;
  label: string;
  chipFlow?: string;
  agentPrompt?: string;
  priority: number;
  dismissible?: boolean;
}

const MAX_CHIPS = 3;

export function deriveContextualChips(
  state: AccountState,
  opts?: { lastAgentAction?: string },
): ContextualChip[] {
  const chips: ContextualChip[] = [];

  // --- Critical: always show first ---

  if (state.sessionExpiringSoon) {
    chips.push({
      id: 'session',
      icon: '⚠',
      label: 'Session expiring — refresh',
      chipFlow: 'refresh-session',
      priority: 100,
    });
  }

  if (state.healthFactor !== undefined && state.healthFactor < 1.5 && state.healthFactor > 0) {
    chips.push({
      id: 'risk',
      icon: '⚠',
      label: `Repay — HF at ${state.healthFactor.toFixed(1)}`,
      chipFlow: 'repay',
      priority: 90,
    });
  }

  // --- Actionable: high priority ---

  if (state.pendingRewards > 0) {
    chips.push({
      id: 'rewards',
      icon: '🏆',
      label: `Claim $${state.pendingRewards.toFixed(2)}`,
      chipFlow: 'claim-rewards',
      priority: 80,
    });
  }

  if (state.recentIncoming && state.recentIncoming.length > 0) {
    const fiveMinAgo = Date.now() - 5 * 60_000;
    const recent = state.recentIncoming.filter((tx) => tx.timestamp > fiveMinAgo);
    if (recent.length > 0) {
      const total = recent.reduce((s, tx) => s + tx.amount, 0);
      chips.push({
        id: 'received',
        icon: '💸',
        label: `$${total.toFixed(0)} received — save it?`,
        chipFlow: 'save',
        priority: 75,
        dismissible: true,
      });
    }
  }

  if (state.cash > 5 && state.savingsRate > 0) {
    chips.push({
      id: 'idle',
      icon: '💰',
      label: `Save $${Math.floor(state.cash)} idle — ${state.savingsRate.toFixed(1)}%`,
      chipFlow: 'save-all',
      priority: 70,
    });
  }

  if (state.bestAlternativeRate && state.currentRate) {
    const diff = state.bestAlternativeRate.rate - state.currentRate;
    if (diff > 0.3 && state.savings > 0) {
      chips.push({
        id: 'rate',
        icon: '📈',
        label: `Switch to ${state.bestAlternativeRate.rate.toFixed(1)}% ${state.bestAlternativeRate.protocol}`,
        chipFlow: 'rebalance',
        priority: 65,
        dismissible: true,
      });
    }
  }

  // --- Informational ---

  if (state.isFirstOpenToday && state.overnightEarnings && state.overnightEarnings > 0) {
    chips.push({
      id: 'earnings',
      icon: '💵',
      label: `Earned $${state.overnightEarnings.toFixed(2)} overnight`,
      chipFlow: 'report',
      priority: 50,
      dismissible: true,
    });
  }

  // --- Post-agent suggestions ---

  if (opts?.lastAgentAction) {
    const suggestion = getPostAgentSuggestion(opts.lastAgentAction);
    if (suggestion) chips.push(suggestion);
  }

  // --- Time-of-day awareness ---

  const hour = new Date().getHours();
  if (chips.length === 0 && state.cash > 0 && state.savings > 0) {
    if (hour >= 6 && hour < 10) {
      chips.push({
        id: 'morning',
        icon: '☀',
        label: 'Morning report',
        chipFlow: 'report',
        priority: 15,
      });
    } else if (hour >= 17 && hour < 21) {
      chips.push({
        id: 'evening',
        icon: '📊',
        label: 'Daily summary',
        chipFlow: 'report',
        priority: 15,
      });
    }
  }

  // --- Fallback: discovery ---

  if (chips.length === 0) {
    if (state.cash === 0 && state.savings === 0) {
      chips.push({
        id: 'welcome',
        icon: '👋',
        label: 'Add funds to get started',
        chipFlow: 'receive',
        priority: 10,
      });
    } else if (state.savingsRate > 0 && state.savings > 0) {
      chips.push({
        id: 'good',
        icon: '✅',
        label: `Earning ${state.savingsRate.toFixed(1)}% on $${Math.floor(state.savings)}`,
        chipFlow: 'report',
        priority: 10,
      });
    }
    chips.push({
      id: 'discover',
      icon: '✨',
      label: 'What can I do?',
      agentPrompt: 'What services and features do you have?',
      priority: 5,
    });
  }

  return chips
    .sort((a, b) => b.priority - a.priority)
    .slice(0, MAX_CHIPS);
}

function getPostAgentSuggestion(lastAction: string): ContextualChip | null {
  switch (lastAction) {
    case 'web_search':
    case 'get_news':
      return { id: 'post-search', icon: '🔍', label: 'Search again', agentPrompt: '', priority: 40 };
    case 'get_balance':
    case 'get_portfolio':
      return { id: 'post-portfolio', icon: '📊', label: 'Full report', chipFlow: 'report', priority: 40 };
    case 'search_flights':
      return { id: 'post-flights', icon: '✈', label: 'Email me these results', agentPrompt: 'Email me those flight results', priority: 40 };
    case 'generate_image':
      return { id: 'post-image', icon: '🎨', label: 'Generate another', agentPrompt: '', priority: 40 };
    case 'get_crypto_price':
    case 'get_stock_quote':
      return { id: 'post-price', icon: '💹', label: 'Check portfolio', chipFlow: 'report', priority: 40 };
    default:
      return null;
  }
}
