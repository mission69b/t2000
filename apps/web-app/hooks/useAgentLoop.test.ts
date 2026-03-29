import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/hooks/useAgent', () => ({
  useAgent: () => ({
    agent: {
      getInstance: vi.fn().mockResolvedValue({
        payService: vi.fn().mockResolvedValue({
          result: { data: 'ok' },
          price: '0.005',
          paymentDigest: '0xdigest123',
        }),
      }),
    },
  }),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function llmTextResponse(content: string) {
  return {
    ok: true,
    json: () => Promise.resolve({ content, tool_calls: undefined }),
  };
}

function llmToolResponse(toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>, content?: string) {
  return {
    ok: true,
    json: () => Promise.resolve({
      content,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        function: { name: tc.name, arguments: JSON.stringify(tc.args) },
      })),
    }),
  };
}

function toolResult(data: unknown) {
  return { ok: true, json: () => Promise.resolve(data) };
}

describe('useAgentLoop (unit logic)', () => {
  let useAgentLoop: typeof import('./useAgentLoop').useAgentLoop;
  let renderHook: typeof import('@testing-library/react').renderHook;
  let act: typeof import('@testing-library/react').act;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    const rtl = await import('@testing-library/react');
    renderHook = rtl.renderHook;
    act = rtl.act;
    const mod = await import('./useAgentLoop');
    useAgentLoop = mod.useAgentLoop;
  });

  const defaultOpts = {
    address: '0xtest',
    email: 'test@test.com',
    balanceSummary: 'Total: $100',
    budget: 0.50,
  };

  function makeCallbacks(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      onStep: vi.fn(),
      onStepUpdate: vi.fn(),
      onText: vi.fn(),
      onMedia: vi.fn(),
      onConfirmNeeded: vi.fn().mockResolvedValue(true),
      onDone: vi.fn(),
      onError: vi.fn(),
      ...overrides,
    };
  }

  it('starts in idle status', () => {
    const { result } = renderHook(() => useAgentLoop());
    expect(result.current.status).toBe('idle');
    expect(result.current.totalCost).toBe(0);
  });

  it('calls onText and onDone for a text-only response', async () => {
    mockFetch.mockResolvedValueOnce(llmTextResponse('Hello!'));
    const callbacks = makeCallbacks();
    const { result } = renderHook(() => useAgentLoop());

    await act(async () => {
      await result.current.run('hi', defaultOpts, callbacks);
    });

    expect(callbacks.onText).toHaveBeenCalledWith('Hello!');
    expect(callbacks.onDone).toHaveBeenCalledWith(0);
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('executes read tools without confirmation', async () => {
    mockFetch
      .mockResolvedValueOnce(llmToolResponse([
        { id: 'tc_1', name: 'get_balance', args: {} },
      ]))
      .mockResolvedValueOnce(toolResult({ SUI: 10, USDC: 50 }))
      .mockResolvedValueOnce(llmTextResponse('Your balance is 10 SUI and 50 USDC.'));

    const callbacks = makeCallbacks();
    const { result } = renderHook(() => useAgentLoop());

    await act(async () => {
      await result.current.run('what is my balance?', defaultOpts, callbacks);
    });

    expect(callbacks.onStep).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'get_balance', status: 'running' }),
    );
    expect(callbacks.onStepUpdate).toHaveBeenCalledWith(
      'get_balance',
      expect.objectContaining({ status: 'done', cost: 0 }),
    );
    expect(callbacks.onConfirmNeeded).not.toHaveBeenCalled();
    expect(callbacks.onText).toHaveBeenCalled();
  });

  it('calls onError when LLM API fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const callbacks = makeCallbacks();
    const { result } = renderHook(() => useAgentLoop());

    await act(async () => {
      await result.current.run('hello', defaultOpts, callbacks);
    });

    expect(callbacks.onError).toHaveBeenCalledWith(expect.stringContaining('500'));
  });

  it('truncates tool results larger than 32KB', async () => {
    const largeResult = { data: 'x'.repeat(35_000) };
    mockFetch
      .mockResolvedValueOnce(llmToolResponse([
        { id: 'tc_1', name: 'get_history', args: {} },
      ]))
      .mockResolvedValueOnce(toolResult(largeResult))
      .mockResolvedValueOnce(llmTextResponse('Here is your history.'));

    const callbacks = makeCallbacks();
    const { result } = renderHook(() => useAgentLoop());

    await act(async () => {
      await result.current.run('show history', defaultOpts, callbacks);
    });

    expect(callbacks.onText).toHaveBeenCalled();

    const chatCall = mockFetch.mock.calls[2];
    const body = JSON.parse(chatCall[1].body);
    const toolMsg = body.messages.find((m: { role: string }) => m.role === 'tool');
    expect(toolMsg.content.length).toBeLessThanOrEqual(32_020);
    expect(toolMsg.content).toContain('truncated');
  });

  it('confirms expensive service calls (>$0.50)', async () => {
    mockFetch
      .mockResolvedValueOnce(llmToolResponse([
        { id: 'tc_1', name: 'send_postcard', args: { to_name: 'Alice', to_address: '123 St', message: 'Hi' } },
      ]))
      .mockResolvedValueOnce(llmTextResponse('Postcard sent!'));

    const onConfirmNeeded = vi.fn().mockResolvedValue(true);
    const callbacks = makeCallbacks({ onConfirmNeeded });
    const { result } = renderHook(() => useAgentLoop());

    await act(async () => {
      await result.current.run('send a postcard', defaultOpts, callbacks);
    });

    expect(onConfirmNeeded).toHaveBeenCalledWith(
      'send_postcard',
      expect.any(Object),
      1.0,
    );
  });

  it('stops when user declines confirmation', async () => {
    mockFetch.mockResolvedValueOnce(llmToolResponse([
      { id: 'tc_1', name: 'buy_gift_card', args: { productId: 4521, amount: 50, email: 'test@test.com', country: 'US' } },
    ]));

    const onConfirmNeeded = vi.fn().mockResolvedValue(false);
    const callbacks = makeCallbacks({ onConfirmNeeded });
    const { result } = renderHook(() => useAgentLoop());

    await act(async () => {
      await result.current.run('buy a gift card', defaultOpts, callbacks);
    });

    expect(onConfirmNeeded).toHaveBeenCalled();
    expect(callbacks.onDone).toHaveBeenCalled();
    expect(callbacks.onStep).not.toHaveBeenCalled();
  });

  it('retries once on empty response before erroring', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

    const callbacks = makeCallbacks();
    const { result } = renderHook(() => useAgentLoop());

    await act(async () => {
      await result.current.run('test', defaultOpts, callbacks);
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.stringContaining('empty response'),
    );
  });

  it('cancels via cancel()', async () => {
    let resolveFirst: (v: unknown) => void;
    const firstCall = new Promise((r) => { resolveFirst = r; });

    mockFetch.mockImplementationOnce(() => firstCall);

    const callbacks = makeCallbacks();
    const { result } = renderHook(() => useAgentLoop());

    let runPromise: Promise<void>;
    act(() => {
      runPromise = result.current.run('test', defaultOpts, callbacks);
    });

    act(() => {
      result.current.cancel();
    });

    resolveFirst!(llmTextResponse('Late response'));
    await act(async () => { await runPromise!; });

    expect(callbacks.onDone).toHaveBeenCalled();
  });
});
