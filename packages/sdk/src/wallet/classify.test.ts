import { describe, it, expect } from 'vitest';
import {
  classifyAction,
  classifyLabel,
  classifyTransaction,
  fallbackLabel,
  refineLendingLabel,
  type ClassifyBalanceChange,
} from './classify.js';
import { SUI_TYPE } from '../token-registry.js';

/**
 * Shared classifier tests. Mirrors the engine's `history-labels.test.ts`
 * but pinned at the SDK boundary — this is the single source of truth
 * consumed by both the engine RPC path and the SDK agent path.
 *
 * Regression guard: pre-consolidation the SDK had its own
 * `classifyAction` that emitted `'transaction'` for everything that
 * wasn't NAVI/Cetus/transfer, which the frontend rendered as
 * "On-chain" — wiping out the fine-grained labels the engine had
 * already shipped.
 */

const ADDR = '0xowner';
const USDC = '0x2::usdc::USDC';

function bc(owner: string, coinType: string, amount: string): ClassifyBalanceChange {
  return { owner: { AddressOwner: owner }, coinType, amount };
}

describe('classifyAction (coarse bucket)', () => {
  it('maps NAVI MoveCall targets to lending', () => {
    expect(classifyAction(['0xpkg::navi::deposit'], ['MoveCall'])).toBe('lending');
  });

  it('maps suilend MoveCall targets to lending', () => {
    expect(classifyAction(['0xpkg::suilend::repay'], ['MoveCall'])).toBe('lending');
  });

  it('maps Cetus pool MoveCall targets to swap', () => {
    expect(classifyAction(['0xpkg::cetus::route'], ['MoveCall'])).toBe('swap');
  });

  it('maps deepbook MoveCall targets to swap', () => {
    expect(classifyAction(['0xpkg::deepbook::place'], ['MoveCall'])).toBe('swap');
  });

  it('classifies plain TransferObjects without MoveCall as send', () => {
    expect(classifyAction([], ['TransferObjects'])).toBe('send');
  });

  it('falls back to transaction for unknown MoveCall', () => {
    expect(classifyAction(['0xpkg::other::do'], ['MoveCall'])).toBe('transaction');
  });
});

describe('classifyLabel (fine-grained display)', () => {
  it('labels deposit functions as deposit', () => {
    expect(classifyLabel(['0xpkg::navi::deposit_with_account_cap'], ['MoveCall'])).toBe('deposit');
  });

  it('labels withdraw functions as withdraw', () => {
    expect(classifyLabel(['0xpkg::navi::withdraw'], ['MoveCall'])).toBe('withdraw');
  });

  it('labels borrow functions as borrow', () => {
    expect(classifyLabel(['0xpkg::navi::borrow'], ['MoveCall'])).toBe('borrow');
  });

  it('labels repay functions as repay', () => {
    expect(classifyLabel(['0xpkg::navi::repay'], ['MoveCall'])).toBe('repay');
  });

  it('labels payment-kit calls as payment_link', () => {
    expect(classifyLabel(['0xmysten::payment_kit::create'], ['MoveCall'])).toBe('payment_link');
  });

  it('labels suilend lending_core entry as lending action via classifyAction', () => {
    expect(classifyAction(['0xpkg::lending_core::entry_deposit'], ['MoveCall'])).toBe('lending');
  });

  it('returns module name when no LABEL_PATTERNS match', () => {
    expect(classifyLabel(['0xpkg::spam_token::do'], ['MoveCall'])).toBe('spam_token');
  });

  it('returns on-chain when no MoveCalls and no transfer', () => {
    expect(classifyLabel([], [])).toBe('on-chain');
  });
});

describe('fallbackLabel', () => {
  it('returns on-chain for empty targets', () => {
    expect(fallbackLabel([])).toBe('on-chain');
  });
  it('returns lowercased module name when present', () => {
    expect(fallbackLabel(['0xpkg::SomeModule::fn'])).toBe('somemodule');
  });
});

describe('refineLendingLabel (balance-direction tiebreaker)', () => {
  it('infers deposit from net non-SUI outflow on generic lending call', () => {
    const out = refineLendingLabel(
      'lending',
      'navi',
      ['0xpkg::navi::entry_action'],
      [bc(ADDR, USDC, '-10000000')],
      ADDR,
    );
    expect(out).toBe('deposit');
  });

  it('infers withdraw from net non-SUI inflow on generic lending call', () => {
    const out = refineLendingLabel(
      'lending',
      'navi',
      ['0xpkg::navi::entry_action'],
      [bc(ADDR, USDC, '10000000')],
      ADDR,
    );
    expect(out).toBe('withdraw');
  });

  it('does not override a specific label that matched LABEL_PATTERNS', () => {
    const out = refineLendingLabel(
      'lending',
      'borrow',
      ['0xpkg::navi::borrow'],
      [bc(ADDR, USDC, '10000000')],
      ADDR,
    );
    expect(out).toBe('borrow');
  });

  it('skips SUI-only changes (gas) so no-op lending stays unchanged', () => {
    const out = refineLendingLabel(
      'lending',
      'navi',
      ['0xpkg::navi::entry_noop'],
      [bc(ADDR, SUI_TYPE, '-5000')],
      ADDR,
    );
    expect(out).toBe('navi');
  });

  it('does nothing when action is not lending', () => {
    const out = refineLendingLabel(
      'send',
      'send',
      [],
      [bc(ADDR, USDC, '-10000000')],
      ADDR,
    );
    expect(out).toBe('send');
  });
});

describe('classifyTransaction (combined)', () => {
  it('returns both action and label in a single call', () => {
    const result = classifyTransaction(
      ['0xpkg::navi::deposit'],
      ['MoveCall'],
      [bc(ADDR, USDC, '-10000000')],
      ADDR,
    );
    expect(result.action).toBe('lending');
    expect(result.label).toBe('deposit');
  });

  it('always populates label field even for unknown txs', () => {
    const result = classifyTransaction(
      ['0xpkg::unknown::do'],
      ['MoveCall'],
      [],
      ADDR,
    );
    expect(result.action).toBe('transaction');
    expect(result.label).toBe('unknown');
    expect(result.label).not.toBe('');
  });
});
