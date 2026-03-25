import { describe, it, expect } from 'vitest';
import { deriveContextualChips, type AccountState } from './contextual-chips';

const BASE_STATE: AccountState = {
  cash: 0,
  savings: 0,
  borrows: 0,
  savingsRate: 0,
  pendingRewards: 0,
};

describe('deriveContextualChips', () => {
  it('returns max 3 chips', () => {
    const chips = deriveContextualChips({
      ...BASE_STATE,
      sessionExpiringSoon: true,
      healthFactor: 1.2,
      pendingRewards: 5,
      cash: 200,
      savingsRate: 6.0,
    });
    expect(chips.length).toBeLessThanOrEqual(3);
  });

  it('returns chips sorted by priority (highest first)', () => {
    const chips = deriveContextualChips({
      ...BASE_STATE,
      sessionExpiringSoon: true,
      pendingRewards: 5,
      cash: 200,
      savingsRate: 6.0,
    });
    for (let i = 1; i < chips.length; i++) {
      expect(chips[i - 1].priority).toBeGreaterThanOrEqual(chips[i].priority);
    }
  });

  it('shows session chip at highest priority', () => {
    const chips = deriveContextualChips({
      ...BASE_STATE,
      sessionExpiringSoon: true,
      pendingRewards: 10,
    });
    expect(chips[0].id).toBe('session');
    expect(chips[0].chipFlow).toBe('refresh-session');
  });

  it('shows risk chip when health factor < 1.5', () => {
    const chips = deriveContextualChips({
      ...BASE_STATE,
      healthFactor: 1.2,
    });
    const riskChip = chips.find((c) => c.id === 'risk');
    expect(riskChip).toBeDefined();
    expect(riskChip!.label).toContain('1.2');
    expect(riskChip!.chipFlow).toBe('repay');
  });

  it('does not show risk chip when health factor >= 1.5', () => {
    const chips = deriveContextualChips({ ...BASE_STATE, healthFactor: 2.0 });
    expect(chips.find((c) => c.id === 'risk')).toBeUndefined();
  });

  it('shows rewards chip', () => {
    const chips = deriveContextualChips({ ...BASE_STATE, pendingRewards: 12.4 });
    const chip = chips.find((c) => c.id === 'rewards');
    expect(chip).toBeDefined();
    expect(chip!.label).toContain('$12.40');
  });

  it('shows idle funds chip when cash > 5 and rate > 0', () => {
    const chips = deriveContextualChips({ ...BASE_STATE, cash: 105, savingsRate: 6.8 });
    const chip = chips.find((c) => c.id === 'idle');
    expect(chip).toBeDefined();
    expect(chip!.chipFlow).toBe('save-all');
  });

  it('does not show idle funds when savings rate is 0', () => {
    const chips = deriveContextualChips({ ...BASE_STATE, cash: 105, savingsRate: 0 });
    expect(chips.find((c) => c.id === 'idle')).toBeUndefined();
  });

  it('shows better rate chip when diff > 0.3%', () => {
    const chips = deriveContextualChips({
      ...BASE_STATE,
      savings: 1000,
      currentRate: 5.0,
      bestAlternativeRate: { protocol: 'Suilend', rate: 6.5 },
    });
    const chip = chips.find((c) => c.id === 'rate');
    expect(chip).toBeDefined();
    expect(chip!.label).toContain('Suilend');
    expect(chip!.dismissible).toBe(true);
  });

  it('shows overnight earnings chip on first open', () => {
    const chips = deriveContextualChips({
      ...BASE_STATE,
      isFirstOpenToday: true,
      overnightEarnings: 1.25,
    });
    const chip = chips.find((c) => c.id === 'earnings');
    expect(chip).toBeDefined();
    expect(chip!.label).toContain('$1.25');
  });

  it('shows received funds chip for recent transfers', () => {
    const chips = deriveContextualChips({
      ...BASE_STATE,
      recentIncoming: [{ amount: 50, asset: 'USDC', from: '0xabc', timestamp: Date.now() - 60_000 }],
    });
    const chip = chips.find((c) => c.id === 'received');
    expect(chip).toBeDefined();
    expect(chip!.label).toContain('$50');
    expect(chip!.chipFlow).toBe('save');
  });

  it('does not show received funds for old transfers (>5 min)', () => {
    const chips = deriveContextualChips({
      ...BASE_STATE,
      recentIncoming: [{ amount: 50, asset: 'USDC', from: '0xabc', timestamp: Date.now() - 10 * 60_000 }],
    });
    expect(chips.find((c) => c.id === 'received')).toBeUndefined();
  });

  it('shows welcome chip for empty accounts', () => {
    const chips = deriveContextualChips(BASE_STATE);
    expect(chips[0].id).toBe('welcome');
    expect(chips[0].chipFlow).toBe('receive');
  });

  it('shows discover chip as fallback', () => {
    const chips = deriveContextualChips(BASE_STATE);
    const discover = chips.find((c) => c.id === 'discover');
    expect(discover).toBeDefined();
    expect(discover!.agentPrompt).toBeTruthy();
  });

  it('shows "all good" chip when funded with no issues', () => {
    const chips = deriveContextualChips({ ...BASE_STATE, cash: 0, savings: 100, savingsRate: 4.5 });
    const good = chips.find((c) => c.id === 'good');
    expect(good).toBeDefined();
    expect(good!.label).toContain('4.5%');
  });

  it('critical states bump low-priority items out of max 3', () => {
    const chips = deriveContextualChips({
      ...BASE_STATE,
      sessionExpiringSoon: true,
      healthFactor: 1.2,
      pendingRewards: 5,
      cash: 200,
      savingsRate: 6.0,
    });
    expect(chips.length).toBe(3);
    expect(chips[0].id).toBe('session');
    expect(chips[1].id).toBe('risk');
    expect(chips[2].id).toBe('rewards');
  });
});

describe('post-agent suggestions', () => {
  it('suggests "Full report" after get_balance', () => {
    const chips = deriveContextualChips(BASE_STATE, { lastAgentAction: 'get_balance' });
    const postChip = chips.find((c) => c.id === 'post-portfolio');
    expect(postChip).toBeDefined();
    expect(postChip!.chipFlow).toBe('report');
  });

  it('suggests "Email results" after search_flights', () => {
    const chips = deriveContextualChips(BASE_STATE, { lastAgentAction: 'search_flights' });
    const postChip = chips.find((c) => c.id === 'post-flights');
    expect(postChip).toBeDefined();
    expect(postChip!.agentPrompt).toContain('Email');
  });

  it('suggests "Generate another" after generate_image', () => {
    const chips = deriveContextualChips(BASE_STATE, { lastAgentAction: 'generate_image' });
    const postChip = chips.find((c) => c.id === 'post-image');
    expect(postChip).toBeDefined();
  });

  it('does not suggest for unknown actions', () => {
    const chips = deriveContextualChips(BASE_STATE, { lastAgentAction: 'send_email' });
    const postChips = chips.filter((c) => c.id.startsWith('post-'));
    expect(postChips).toHaveLength(0);
  });
});
