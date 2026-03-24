import { describe, it, expect } from 'vitest';
import { deriveSmartCards, type AccountState } from './smart-cards';

const BASE_STATE: AccountState = {
  checking: 0,
  savings: 0,
  borrows: 0,
  savingsRate: 0,
  pendingRewards: 0,
};

describe('deriveSmartCards', () => {
  it('shows welcome card when balance is zero', () => {
    const cards = deriveSmartCards(BASE_STATE);
    expect(cards).toHaveLength(1);
    expect(cards[0].type).toBe('all-good');
    expect(cards[0].title).toContain('Welcome');
    expect(cards[0].actions[0].chipFlow).toBe('receive');
  });

  it('shows "all good" card when funded with no issues', () => {
    const cards = deriveSmartCards({ ...BASE_STATE, checking: 5, savings: 100 });
    expect(cards).toHaveLength(1);
    expect(cards[0].type).toBe('all-good');
    expect(cards[0].title).toContain('working for you');
  });

  it('surfaces session expiry card when session is expiring soon', () => {
    const cards = deriveSmartCards({ ...BASE_STATE, sessionExpiringSoon: true });
    const sessionCard = cards.find((c) => c.type === 'session-expiry');
    expect(sessionCard).toBeDefined();
    expect(sessionCard!.actions[0].chipFlow).toBe('refresh-session');
  });

  it('surfaces rewards card when pendingRewards > 0', () => {
    const cards = deriveSmartCards({ ...BASE_STATE, pendingRewards: 12.4 });
    const rewardsCard = cards.find((c) => c.type === 'rewards');
    expect(rewardsCard).toBeDefined();
    expect(rewardsCard!.title).toContain('$12.40');
    expect(rewardsCard!.actions[0].chipFlow).toBe('claim-rewards');
  });

  it('does not surface rewards card when pendingRewards is 0', () => {
    const cards = deriveSmartCards({ ...BASE_STATE, pendingRewards: 0 });
    expect(cards.find((c) => c.type === 'rewards')).toBeUndefined();
  });

  it('surfaces idle-funds card when checking > $5', () => {
    const cards = deriveSmartCards({ ...BASE_STATE, checking: 105, savingsRate: 6.8 });
    const idleCard = cards.find((c) => c.type === 'idle-funds');
    expect(idleCard).toBeDefined();
    expect(idleCard!.title).toContain('$105');
    expect(idleCard!.actions[0].chipFlow).toBe('save-all');
  });

  it('surfaces idle-funds card when checking is $8', () => {
    const cards = deriveSmartCards({ ...BASE_STATE, checking: 8, savingsRate: 4.9 });
    const idleCard = cards.find((c) => c.type === 'idle-funds');
    expect(idleCard).toBeDefined();
    expect(idleCard!.title).toContain('$8');
  });

  it('does not surface idle-funds card when checking <= $5', () => {
    const cards = deriveSmartCards({ ...BASE_STATE, checking: 5 });
    expect(cards.find((c) => c.type === 'idle-funds')).toBeUndefined();
  });

  it('surfaces better-rate card when rate diff > 0.3%', () => {
    const cards = deriveSmartCards({
      ...BASE_STATE,
      savings: 1000,
      currentRate: 5.0,
      bestAlternativeRate: { protocol: 'Suilend', rate: 6.5 },
    });
    const rateCard = cards.find((c) => c.type === 'better-rate');
    expect(rateCard).toBeDefined();
    expect(rateCard!.title).toContain('Suilend');
    expect(rateCard!.actions[0].chipFlow).toBe('rebalance');
  });

  it('does not surface better-rate card when diff <= 0.3%', () => {
    const cards = deriveSmartCards({
      ...BASE_STATE,
      savings: 1000,
      currentRate: 5.0,
      bestAlternativeRate: { protocol: 'Suilend', rate: 5.2 },
    });
    expect(cards.find((c) => c.type === 'better-rate')).toBeUndefined();
  });

  it('does not surface better-rate card when savings is 0', () => {
    const cards = deriveSmartCards({
      ...BASE_STATE,
      savings: 0,
      currentRate: 5.0,
      bestAlternativeRate: { protocol: 'Suilend', rate: 8.0 },
    });
    expect(cards.find((c) => c.type === 'better-rate')).toBeUndefined();
  });

  it('surfaces risk card when healthFactor < 1.5', () => {
    const cards = deriveSmartCards({ ...BASE_STATE, healthFactor: 1.2 });
    const riskCard = cards.find((c) => c.type === 'risk');
    expect(riskCard).toBeDefined();
    expect(riskCard!.actions[0].chipFlow).toBe('repay');
  });

  it('does not surface risk card when healthFactor >= 1.5', () => {
    const cards = deriveSmartCards({ ...BASE_STATE, healthFactor: 2.0 });
    expect(cards.find((c) => c.type === 'risk')).toBeUndefined();
  });

  it('surfaces overnight-earnings card on first open of day', () => {
    const cards = deriveSmartCards({
      ...BASE_STATE,
      isFirstOpenToday: true,
      overnightEarnings: 1.25,
    });
    const earningsCard = cards.find((c) => c.type === 'overnight-earnings');
    expect(earningsCard).toBeDefined();
    expect(earningsCard!.title).toContain('$1.25');
  });

  it('does not surface overnight-earnings card when not first open', () => {
    const cards = deriveSmartCards({
      ...BASE_STATE,
      isFirstOpenToday: false,
      overnightEarnings: 1.25,
    });
    expect(cards.find((c) => c.type === 'overnight-earnings')).toBeUndefined();
  });

  it('returns multiple cards in priority order', () => {
    const cards = deriveSmartCards({
      ...BASE_STATE,
      sessionExpiringSoon: true,
      pendingRewards: 5,
      checking: 500,
      savingsRate: 6.0,
    });
    expect(cards.length).toBeGreaterThanOrEqual(3);
    expect(cards[0].type).toBe('session-expiry');
    expect(cards[1].type).toBe('rewards');
    expect(cards[2].type).toBe('idle-funds');
  });

  it('does not include "all good" card when other cards are present', () => {
    const cards = deriveSmartCards({ ...BASE_STATE, pendingRewards: 10 });
    expect(cards.find((c) => c.type === 'all-good')).toBeUndefined();
  });

  it('surfaces debt card when borrows > 0', () => {
    const cards = deriveSmartCards({ ...BASE_STATE, checking: 100, savings: 50, borrows: 20, healthFactor: 3.5 });
    const debtCard = cards.find((c) => c.title.includes('debt'));
    expect(debtCard).toBeDefined();
    expect(debtCard!.title).toContain('$20');
    expect(debtCard!.title).toContain('HF 3.5');
    expect(debtCard!.actions[0].chipFlow).toBe('repay');
  });

  it('does not surface debt card when borrows is 0', () => {
    const cards = deriveSmartCards({ ...BASE_STATE, checking: 100, savings: 50 });
    const debtCard = cards.find((c) => c.title.includes('debt'));
    expect(debtCard).toBeUndefined();
  });
});
