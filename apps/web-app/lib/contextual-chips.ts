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

  // --- Discovery: AI-powered insights ---

  if (state.investments > 0) {
    chips.push({
      id: 'portfolio-check',
      icon: '📊',
      label: 'Portfolio P&L',
      agentPrompt: 'Show me my portfolio performance. What are my holdings, gains/losses, and should I rebalance anything?',
      priority: 28,
      dismissible: true,
    });
  }

  if (state.borrows > 0 && (state.healthFactor === undefined || state.healthFactor >= 1.5)) {
    chips.push({
      id: 'risk-analysis',
      icon: '🛡',
      label: 'Risk analysis',
      agentPrompt: 'Analyze my borrowing risk. Check my health factor, how much room I have before liquidation, and whether I should repay some debt.',
      priority: 25,
      dismissible: true,
    });
  }

  if (state.savings > 10) {
    chips.push({
      id: 'yield-check',
      icon: '🔍',
      label: 'Best yield?',
      agentPrompt: 'Am I getting the best yield on my savings? Compare my current rate to all available protocols and tell me if I should switch.',
      priority: 22,
      dismissible: true,
    });
  }

  if (state.cash > 10) {
    chips.push({
      id: 'what-if',
      icon: '🤔',
      label: 'What if I save it all?',
      agentPrompt: `What would happen if I saved my $${Math.floor(state.cash)} idle cash? Show me projected earnings at the best available rate over 1 month, 6 months, and 1 year.`,
      priority: 18,
      dismissible: true,
    });
  }

  // --- Time-of-day awareness ---

  const hour = new Date().getHours();
  const dayOfWeek = new Date().getDay();
  const hasFunds = state.cash > 0 || state.savings > 0;

  if (hasFunds) {
    if (hour >= 6 && hour < 10) {
      chips.push({
        id: 'morning',
        icon: '☀',
        label: 'Morning report',
        agentPrompt: 'Give me my morning financial report. Check my balances, savings yield, portfolio holdings, health factor, and suggest any actions I should take today.',
        priority: 15,
      });
    } else if (hour >= 17 && hour < 21) {
      chips.push({
        id: 'evening',
        icon: '📊',
        label: 'Daily summary',
        agentPrompt: 'Give me my end-of-day financial summary. Check my balances, savings yield, portfolio performance, and any changes today.',
        priority: 15,
      });
    }

    if (dayOfWeek === 0 || dayOfWeek === 6) {
      chips.push({
        id: 'weekly-recap',
        icon: '📅',
        label: 'Weekly recap',
        agentPrompt: 'Give me my weekly recap. Summarize my balances, transactions this week, portfolio changes, savings earnings, and any action items.',
        priority: 14,
        dismissible: true,
      });
    }
  }

  // --- Fallback: onboarding + discovery ---

  if (state.cash === 0 && state.savings === 0 && state.investments === 0) {
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

  const sorted = chips.sort((a, b) => b.priority - a.priority);
  const seen = new Set<string>();
  const deduped: ContextualChip[] = [];
  for (const chip of sorted) {
    if (!seen.has(chip.label)) {
      seen.add(chip.label);
      deduped.push(chip);
    }
    if (deduped.length >= MAX_CHIPS) break;
  }
  return deduped;
}

function getPostAgentSuggestion(lastAction: string): ContextualChip | null {
  switch (lastAction) {
    case 'web_search':
    case 'get_news':
      return { id: 'post-search', icon: '🔍', label: 'Search again', agentPrompt: '', priority: 40 };
    case 'get_balance':
      return { id: 'post-balance', icon: '🤔', label: 'What if I save it all?', agentPrompt: 'What would happen if I saved all my idle cash? Project my earnings over 1 month, 6 months, and 1 year.', priority: 40 };
    case 'get_portfolio':
      return { id: 'post-portfolio', icon: '📊', label: 'Full report', agentPrompt: 'Give me a full financial report covering my balances, portfolio performance, yields, and action items.', priority: 40 };
    case 'get_rates':
      return { id: 'post-rates', icon: '🔍', label: 'Best yield?', agentPrompt: 'Am I getting the best yield? Compare my current rate to what\'s available and tell me if I should switch.', priority: 40 };
    case 'get_health':
      return { id: 'post-health', icon: '📉', label: 'Liquidation risk?', agentPrompt: 'How much could prices drop before I get liquidated? Show me the exact thresholds.', priority: 40 };
    case 'search_flights':
      return { id: 'post-flights', icon: '✈', label: 'Email me these results', agentPrompt: 'Email me those flight results', priority: 40 };
    case 'generate_image':
      return { id: 'post-image', icon: '🎨', label: 'Generate another', agentPrompt: '', priority: 40 };
    case 'get_crypto_price':
    case 'get_stock_quote':
      return { id: 'post-price', icon: '💹', label: 'Check portfolio', agentPrompt: 'How does my portfolio compare to what I just looked up? Show me my holdings and P&L.', priority: 40 };
    case 'translate':
      return { id: 'post-translate', icon: '🌐', label: 'Translate more', agentPrompt: '', priority: 40 };
    case 'convert_currency':
      return { id: 'post-convert', icon: '💱', label: 'Convert another', agentPrompt: '', priority: 40 };
    default:
      return null;
  }
}
