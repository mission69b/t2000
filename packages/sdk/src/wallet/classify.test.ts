import { describe, it, expect } from 'vitest';
import {
  classifyAction,
  classifyLabel,
  classifyTransaction,
  extractTransferDetails,
  fallbackLabel,
  refineLendingLabel,
  type ClassifyBalanceChange,
} from './classify.js';
import { SUI_TYPE, USDC_TYPE } from '../token-registry.js';

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
// Use the canonical mainnet USDC type so getDecimalsForCoinType returns 6
// and the bidirectional extractor produces realistic amounts in the tests.
const USDC = USDC_TYPE;

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

  it('returns module name only when the coarse action is also generic', () => {
    // `spam_token` doesn't match any KNOWN_TARGETS (action='transaction')
    // AND doesn't match any LABEL_PATTERNS, so the module name
    // becomes the last-resort fallback.
    expect(classifyLabel(['0xpkg::spam_token::do'], ['MoveCall'])).toBe('spam_token');
  });

  it('returns the action bucket when LABEL_PATTERNS misses but action is specific', () => {
    // Pre-v0.46.2 regression: Cetus aggregator emits a sequence of
    // MoveCalls — `router::new_swap_context`, `cetus::swap`,
    // `router::transfer_balance`, `router::confirm_swap`. The
    // `cetus::swap` pattern correctly bucketed action='swap', but
    // classifyLabel saw no LABEL_PATTERNS match and fell back to
    // the FIRST MoveCall's module name = "router".
    const cetusAggregatorTargets = [
      '0xrouter::router::new_swap_context_v',
      '0xpath::cetus::swap',
      '0xrouter::router::transfer_balance',
      '0xrouter::router::confirm_swap',
    ];
    expect(classifyLabel(cetusAggregatorTargets, ['MoveCall', 'MoveCall', 'MoveCall', 'MoveCall'])).toBe('swap');
    expect(classifyLabel(['0xpkg::deepbook::place_order'], ['MoveCall'])).toBe('swap');
    // Direct (non-aggregator) DEX calls are bucketed as swap too.
    expect(classifyLabel(['0xpath::flowx_amm::swap'], ['MoveCall'])).toBe('swap');
    expect(classifyLabel(['0xpath::aftermath::swap'], ['MoveCall'])).toBe('swap');
  });

  it('lending generic call falls back to "lending" not module name', () => {
    // Generic NAVI entry without deposit/withdraw keyword — action
    // bucket says 'lending'; refineLendingLabel handles direction.
    expect(classifyLabel(['0xpkg::navi::entry_action'], ['MoveCall'])).toBe('lending');
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
    // Action is generic 'transaction', so we surface the module name
    // as a last-resort fallback instead of the literal "transaction".
    expect(result.label).toBe('unknown');
    expect(result.label).not.toBe('');
  });

  it('classifies Cetus aggregator router calls as swap (not "router")', () => {
    // Real Cetus aggregator emits multiple MoveCalls per swap: a
    // router setup + per-DEX leg + router cleanup. The first target
    // is the router glue, NOT the DEX leg, so the classifier must
    // not return 'router' from the module fallback.
    const result = classifyTransaction(
      [
        '0xrouter::router::new_swap_context_v',
        '0xpath::cetus::swap',
        '0xrouter::router::transfer_balance',
        '0xrouter::router::confirm_swap',
      ],
      ['MoveCall', 'MoveCall', 'MoveCall', 'MoveCall'],
      [
        bc(ADDR, USDC, '-1000000'),
        { owner: { AddressOwner: '0xpool' }, coinType: USDC, amount: '1000000' },
      ],
      ADDR,
    );
    expect(result.action).toBe('swap');
    expect(result.label).toBe('swap');
  });
});

describe('extractTransferDetails (bidirectional)', () => {
  it('returns outflow for a send: user USDC -1, recipient USDC +1', () => {
    const out = extractTransferDetails(
      [
        bc(ADDR, USDC, '-1000000'),
        { owner: { AddressOwner: '0xfriend' }, coinType: USDC, amount: '1000000' },
      ],
      ADDR,
    );
    expect(out.amount).toBe(1);
    expect(out.asset).toBe('USDC');
    expect(out.direction).toBe('out');
    expect(out.recipient).toBe('0xfriend');
  });

  it('returns inflow for a withdraw: user USDC +10 (no SUI outflow, sponsored gas)', () => {
    // Pre-v0.46.2 regression: withdraws / borrows / claims showed
    // no amount on the card because the old extractor only looked
    // at the user's outflows.
    const out = extractTransferDetails([bc(ADDR, USDC, '10000000')], ADDR);
    expect(out.amount).toBe(10);
    expect(out.asset).toBe('USDC');
    expect(out.direction).toBe('in');
    expect(out.recipient).toBeUndefined();
  });

  it('returns inflow for a borrow: user USDC +5 with NAVI -5', () => {
    const out = extractTransferDetails(
      [
        bc(ADDR, USDC, '5000000'),
        { owner: { AddressOwner: '0xnavi' }, coinType: USDC, amount: '-5000000' },
      ],
      ADDR,
    );
    expect(out.amount).toBe(5);
    expect(out.direction).toBe('in');
  });

  it('prefers non-SUI principal: user USDC -1, user SUI +0.5 (swap output)', () => {
    // Cetus swap USDC→SUI: user loses USDC, gains SUI. SUI gain is
    // the actual swap output but USDC loss is the user's intent —
    // pick the larger non-SUI principal so the card reads "−1 USDC".
    const out = extractTransferDetails(
      [
        bc(ADDR, USDC, '-1000000'),
        bc(ADDR, SUI_TYPE, '500000000'),
      ],
      ADDR,
    );
    expect(out.amount).toBe(1);
    expect(out.asset).toBe('USDC');
    expect(out.direction).toBe('out');
  });

  it('falls back to SUI when only SUI changes exist (e.g. native send)', () => {
    const out = extractTransferDetails(
      [
        bc(ADDR, SUI_TYPE, '-2000000000'),
        { owner: { AddressOwner: '0xfriend' }, coinType: SUI_TYPE, amount: '2000000000' },
      ],
      ADDR,
    );
    expect(out.amount).toBe(2);
    expect(out.asset).toBe('SUI');
    expect(out.direction).toBe('out');
    expect(out.recipient).toBe('0xfriend');
  });

  it('returns empty when there are no balance changes', () => {
    expect(extractTransferDetails([], ADDR)).toEqual({});
    expect(extractTransferDetails(undefined, ADDR)).toEqual({});
  });

  it('returns empty when no user balance changes are present', () => {
    const out = extractTransferDetails(
      [{ owner: { AddressOwner: '0xother' }, coinType: USDC, amount: '5000000' }],
      ADDR,
    );
    expect(out).toEqual({});
  });

  it('does not set recipient on inflows (no symmetric outflow exists)', () => {
    const out = extractTransferDetails(
      [
        bc(ADDR, USDC, '10000000'),
        { owner: { AddressOwner: '0xnavi' }, coinType: USDC, amount: '-10000000' },
      ],
      ADDR,
    );
    expect(out.direction).toBe('in');
    expect(out.recipient).toBeUndefined();
  });
});
