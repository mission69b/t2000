import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChipFlow } from './useChipFlow';

// Requires @testing-library/react — skip gracefully if not installed
describe.skipIf(!renderHook)('useChipFlow', () => {
  it('starts in idle phase', () => {
    const { result } = renderHook(() => useChipFlow());
    expect(result.current.state.phase).toBe('idle');
    expect(result.current.state.flow).toBeNull();
  });

  it('transitions to l2-chips on startFlow', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('save'));
    expect(result.current.state.phase).toBe('l2-chips');
    expect(result.current.state.flow).toBe('save');
    expect(result.current.state.message).toBeTruthy();
  });

  it('transitions to confirming on selectAmount', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('save'));
    act(() => result.current.selectAmount(500));
    expect(result.current.state.phase).toBe('confirming');
    expect(result.current.state.amount).toBe(500);
  });

  it('transitions to executing on confirm', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('withdraw'));
    act(() => result.current.selectAmount(200));
    act(() => result.current.confirm());
    expect(result.current.state.phase).toBe('executing');
  });

  it('transitions to result on setResult', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('borrow'));
    act(() => result.current.selectAmount(100));
    act(() => result.current.confirm());
    act(() => result.current.setResult({ success: true, title: 'Borrowed $100', details: 'Done' }));
    expect(result.current.state.phase).toBe('result');
    expect(result.current.state.result?.success).toBe(true);
    expect(result.current.state.result?.title).toBe('Borrowed $100');
  });

  it('transitions to result on setError', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('repay'));
    act(() => result.current.selectAmount(50));
    act(() => result.current.confirm());
    act(() => result.current.setError('Insufficient funds'));
    expect(result.current.state.phase).toBe('result');
    expect(result.current.state.result?.success).toBe(false);
    expect(result.current.state.error).toBe('Insufficient funds');
  });

  it('resets to idle on reset', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('save'));
    act(() => result.current.selectAmount(100));
    act(() => result.current.reset());
    expect(result.current.state.phase).toBe('idle');
    expect(result.current.state.flow).toBeNull();
    expect(result.current.state.amount).toBeNull();
  });

  it('handles send flow with recipient', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('send'));
    expect(result.current.state.flow).toBe('send');
    act(() => result.current.selectRecipient('0x1234abcd', 'Alice'));
    expect(result.current.state.recipient).toBe('0x1234abcd');
    expect(result.current.state.subFlow).toBe('Alice');
    act(() => result.current.selectAmount(25));
    expect(result.current.state.phase).toBe('confirming');
    expect(result.current.state.amount).toBe(25);
  });

  it('can cancel at l2-chips and return to idle', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('save'));
    expect(result.current.state.phase).toBe('l2-chips');
    act(() => result.current.reset());
    expect(result.current.state.phase).toBe('idle');
  });

  it('can cancel at confirming and return to idle', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('save'));
    act(() => result.current.selectAmount(100));
    expect(result.current.state.phase).toBe('confirming');
    act(() => result.current.reset());
    expect(result.current.state.phase).toBe('idle');
  });

  it('starts swap flow in asset-select phase', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('swap'));
    expect(result.current.state.phase).toBe('asset-select');
    expect(result.current.state.flow).toBe('swap');
  });

  it('swap flow: selects source then destination asset', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('swap'));
    act(() => result.current.selectAsset('USDC'));
    expect(result.current.state.asset).toBe('USDC');
    expect(result.current.state.phase).toBe('asset-select');

    act(() => result.current.selectAsset('SUI'));
    expect(result.current.state.toAsset).toBe('SUI');
    expect(result.current.state.phase).toBe('l2-chips');
    expect(result.current.state.message).toContain('Buy SUI');
  });

  it('swap flow: sell labels correctly', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('swap'));
    act(() => result.current.selectAsset('BTC'));
    act(() => result.current.selectAsset('USDC'));
    expect(result.current.state.message).toContain('Sell BTC');
  });

  it('startFlow with context generates message with balance info', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('save', { checking: 500, savingsRate: 6.5 }));
    expect(result.current.state.phase).toBe('l2-chips');
    expect(result.current.state.message).toBeTruthy();
  });

  it('handles quoting phase for swaps', () => {
    const { result } = renderHook(() => useChipFlow());
    act(() => result.current.startFlow('swap'));
    act(() => result.current.selectAsset('USDC'));
    act(() => result.current.selectAsset('SUI'));
    act(() => result.current.setQuoting(100));
    expect(result.current.state.phase).toBe('quoting');
    expect(result.current.state.amount).toBe(100);
  });
});
