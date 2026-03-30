import { describe, it, expect } from 'vitest';
import {
  TOOL_EXECUTORS,
  getEstimatedCost,
  getAnthropicTools,
  buildSystemPrompt,
  countryFromTimezoneAndLocale,
  normalizeAnthropicResponse,
  toAnthropicMessages,
} from './agent-tools';

describe('TOOL_EXECUTORS', () => {
  it('defines exactly 29 tools (6 read + 22 service + 1 raw-service)', () => {
    const entries = Object.entries(TOOL_EXECUTORS);
    expect(entries.length).toBe(29);

    const reads = entries.filter(([, e]) => e.type === 'read');
    const services = entries.filter(([, e]) => e.type === 'service');
    expect(reads.length).toBe(6);
    expect(services.length).toBe(22);
  });

  it('every service executor has a serviceId and transform', () => {
    for (const [name, executor] of Object.entries(TOOL_EXECUTORS)) {
      if (executor.type === 'service') {
        expect(executor.serviceId, `${name} missing serviceId`).toBeTruthy();
        expect(executor.transform, `${name} missing transform`).toBeTypeOf('function');
      }
    }
  });

  it('read executors have no serviceId', () => {
    for (const [, executor] of Object.entries(TOOL_EXECUTORS)) {
      if (executor.type === 'read') {
        expect(executor.serviceId).toBeUndefined();
      }
    }
  });
});

describe('TOOL_EXECUTORS transforms', () => {
  it('web_search transforms query', () => {
    const result = TOOL_EXECUTORS.web_search.transform!({ query: 'sui blockchain' });
    expect(result).toEqual({ q: 'sui blockchain' });
  });

  it('send_email transforms all fields', () => {
    const result = TOOL_EXECUTORS.send_email.transform!({
      to: 'user@test.com',
      subject: 'Hello',
      body: 'Test body',
    });
    expect(result).toEqual({ to: 'user@test.com', subject: 'Hello', body: 'Test body' });
  });

  it('convert_currency stringifies amount', () => {
    const result = TOOL_EXECUTORS.convert_currency.transform!({
      from: 'USD',
      to: 'EUR',
      amount: 100,
    });
    expect(result).toEqual({ from: 'USD', to: 'EUR', amount: '100' });
  });

  it('run_code defaults language to python', () => {
    const result = TOOL_EXECUTORS.run_code.transform!({ code: 'print(1)' });
    expect(result.language).toBe('python');
  });

  it('search_flights maps from/to to departure/arrival', () => {
    const result = TOOL_EXECUTORS.search_flights.transform!({
      from: 'SYD',
      to: 'NRT',
      date: '2026-04-15',
    });
    expect(result).toEqual({ departure: 'SYD', arrival: 'NRT', date: '2026-04-15' });
  });
});

describe('getEstimatedCost', () => {
  it('returns 0 for read tools', () => {
    expect(getEstimatedCost('get_balance')).toBe(0);
    expect(getEstimatedCost('get_rates')).toBe(0);
    expect(getEstimatedCost('get_history')).toBe(0);
    expect(getEstimatedCost('get_portfolio')).toBe(0);
    expect(getEstimatedCost('get_health')).toBe(0);
  });

  it('returns correct cost for service tools', () => {
    expect(getEstimatedCost('web_search')).toBe(0.005);
    expect(getEstimatedCost('generate_image')).toBe(0.03);
    expect(getEstimatedCost('text_to_speech')).toBe(0.05);
    expect(getEstimatedCost('send_postcard')).toBe(1.0);
  });

  it('returns 0 for unknown tools', () => {
    expect(getEstimatedCost('nonexistent_tool')).toBe(0);
  });
});

describe('getAnthropicTools', () => {
  it('returns 31 tool schemas', () => {
    const tools = getAnthropicTools();
    expect(tools.length).toBe(31);
  });

  it('every tool has name, description, and input_schema', () => {
    for (const tool of getAnthropicTools()) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.input_schema).toBeDefined();
      expect(tool.input_schema.type).toBe('object');
    }
  });

  it('tool names match TOOL_EXECUTORS keys', () => {
    const schemaNames = getAnthropicTools().map((t) => t.name).sort();
    const executorNames = Object.keys(TOOL_EXECUTORS).sort();
    expect(schemaNames).toEqual(executorNames);
  });
});

describe('buildSystemPrompt', () => {
  it('includes user context', () => {
    const prompt = buildSystemPrompt('0xabc123', 'user@test.com', 'Total: $500');
    expect(prompt).toContain('0xabc123');
    expect(prompt).toContain('user@test.com');
    expect(prompt).toContain('Total: $500');
  });

  it('handles missing balance', () => {
    const prompt = buildSystemPrompt('0xabc123', 'user@test.com');
    expect(prompt).toContain('unknown');
  });

  it('includes help guidance', () => {
    const prompt = buildSystemPrompt('0xabc123', 'user@test.com');
    expect(prompt).toContain('what can you do');
    expect(prompt).toContain('First-time users');
  });

  it('includes multi-protocol DeFi section', () => {
    const prompt = buildSystemPrompt('0xabc123', 'user@test.com');
    expect(prompt).toContain('Multi-Protocol DeFi');
    expect(prompt).toContain('NAVI');
    expect(prompt).toContain('Suilend');
    expect(prompt).toContain('rebalancing');
  });

  it('get_rates tool description mentions multi-protocol', () => {
    const tools = getAnthropicTools();
    const ratesTool = tools.find((t) => t.name === 'get_rates');
    expect(ratesTool).toBeDefined();
    expect(ratesTool!.description).toContain('protocolId');
    expect(ratesTool!.description).toContain('bestSaveRate');
  });

  it('includes country from locale', () => {
    const prompt = buildSystemPrompt('0xabc', 'u@t.com', undefined, 'en-AU');
    expect(prompt).toContain('Country: AU');
    expect(prompt).toContain('GIFT GIVING');
  });

  it('defaults country to US when no locale', () => {
    const prompt = buildSystemPrompt('0xabc', 'u@t.com');
    expect(prompt).toContain('Country: US');
  });

  it('uses timezone over locale for country detection', () => {
    const prompt = buildSystemPrompt('0xabc', 'u@t.com', undefined, 'en-GB', 'Australia/Sydney');
    expect(prompt).toContain('Country: AU');
  });

  it('detects AU from any Australia/* timezone', () => {
    expect(countryFromTimezoneAndLocale('Australia/Melbourne')).toBe('AU');
    expect(countryFromTimezoneAndLocale('Australia/Perth')).toBe('AU');
    expect(countryFromTimezoneAndLocale('Australia/Brisbane')).toBe('AU');
  });

  it('detects correct country from timezone', () => {
    expect(countryFromTimezoneAndLocale('Asia/Tokyo')).toBe('JP');
    expect(countryFromTimezoneAndLocale('America/New_York')).toBe('US');
    expect(countryFromTimezoneAndLocale('Europe/London')).toBe('GB');
    expect(countryFromTimezoneAndLocale('Africa/Lagos')).toBe('NG');
  });

  it('falls back to locale when timezone unknown', () => {
    expect(countryFromTimezoneAndLocale(undefined, 'en-AU')).toBe('AU');
    expect(countryFromTimezoneAndLocale('Unknown/Zone', 'fr-FR')).toBe('FR');
  });
});

describe('normalizeAnthropicResponse', () => {
  it('normalizes text-only response', () => {
    const response = {
      content: [{ type: 'text' as const, text: 'Hello there' }],
    } as never;
    const result = normalizeAnthropicResponse(response);
    expect(result.content).toBe('Hello there');
    expect(result.tool_calls).toBeUndefined();
  });

  it('normalizes tool_use response', () => {
    const response = {
      content: [
        { type: 'tool_use' as const, id: 'tc_1', name: 'web_search', input: { query: 'sui' } },
      ],
    } as never;
    const result = normalizeAnthropicResponse(response);
    expect(result.tool_calls).toHaveLength(1);
    expect(result.tool_calls![0].id).toBe('tc_1');
    expect(result.tool_calls![0].function.name).toBe('web_search');
    expect(JSON.parse(result.tool_calls![0].function.arguments)).toEqual({ query: 'sui' });
  });

  it('normalizes mixed text + tool_use', () => {
    const response = {
      content: [
        { type: 'text' as const, text: 'Let me search' },
        { type: 'tool_use' as const, id: 'tc_2', name: 'get_balance', input: {} },
      ],
    } as never;
    const result = normalizeAnthropicResponse(response);
    expect(result.content).toBe('Let me search');
    expect(result.tool_calls).toHaveLength(1);
  });
});

describe('toAnthropicMessages', () => {
  it('converts user messages', () => {
    const result = toAnthropicMessages([{ role: 'user', content: 'hello' }]);
    expect(result).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('converts assistant messages with tool_calls to content blocks', () => {
    const result = toAnthropicMessages([{
      role: 'assistant',
      content: 'Searching...',
      tool_calls: [{
        id: 'tc_1',
        function: { name: 'web_search', arguments: '{"query":"sui"}' },
      }],
    }]);

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('assistant');
    const blocks = result[0].content as Array<{ type: string }>;
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ type: 'text', text: 'Searching...' });
    expect(blocks[1]).toMatchObject({ type: 'tool_use', id: 'tc_1', name: 'web_search' });
  });

  it('groups consecutive tool results into a single user message', () => {
    const result = toAnthropicMessages([
      { role: 'tool', tool_call_id: 'tc_1', content: '{"result":1}' },
      { role: 'tool', tool_call_id: 'tc_2', content: '{"result":2}' },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
    const blocks = result[0].content as Array<{ type: string; tool_use_id: string }>;
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('tool_result');
    expect(blocks[0].tool_use_id).toBe('tc_1');
    expect(blocks[1].tool_use_id).toBe('tc_2');
  });
});
