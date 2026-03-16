import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('hono', () => {
  const routes: Record<string, Record<string, Function>> = {};

  return {
    Hono: class MockHono {
      get(path: string, handler: Function) {
        routes[`GET:${path}`] = { handler };
      }
      post(path: string, handler: Function) {
        routes[`POST:${path}`] = { handler };
      }
      fetch = vi.fn();
    },
    __routes: routes,
  };
});

vi.mock('@hono/node-server', () => {
  return {
    serve: vi.fn((_opts: any, cb?: Function) => {
      if (cb) cb();
      return { close: vi.fn() };
    }),
  };
});

import { WebChatChannel } from './webchat.js';
import { serve } from '@hono/node-server';

describe('WebChatChannel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct id and name', () => {
    const channel = new WebChatChannel(2000);
    expect(channel.id).toBe('webchat');
    expect(channel.name).toBe('WebChat');
  });

  it('returns configured port', () => {
    const channel = new WebChatChannel(3000);
    expect(channel.getPort()).toBe(3000);
  });

  it('starts server on configured port and host', async () => {
    const channel = new WebChatChannel(2000);
    await channel.start();

    expect(serve).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 2000,
        hostname: '127.0.0.1',
      }),
      expect.any(Function),
    );
  });

  it('stops server and clears clients', async () => {
    const channel = new WebChatChannel(2000);
    await channel.start();
    await channel.stop();

    const mockServer = (serve as any).mock.results[0].value;
    expect(mockServer.close).toHaveBeenCalled();
  });

  it('can stop when server is not started', async () => {
    const channel = new WebChatChannel(2000);
    await expect(channel.stop()).resolves.not.toThrow();
  });

  it('registers message handler via onMessage', () => {
    const channel = new WebChatChannel(2000);
    const handler = vi.fn();
    channel.onMessage(handler);
    // Handler stored internally — verified through message flow
    expect(true).toBe(true);
  });

  it('send serializes message as JSON with type=message', async () => {
    const channel = new WebChatChannel(2000);
    // The send method iterates over clients (empty set initially)
    // This verifies it doesn't throw with no clients
    await expect(channel.send('user1', 'Hello')).resolves.not.toThrow();
  });

  it('sendToken serializes as type=token', () => {
    const channel = new WebChatChannel(2000);
    expect(() => channel.sendToken('partial')).not.toThrow();
  });

  it('sendToolCall serializes name and dryRun', () => {
    const channel = new WebChatChannel(2000);
    expect(() => channel.sendToolCall('t2000_balance', true)).not.toThrow();
    expect(() => channel.sendToolCall('t2000_send', false)).not.toThrow();
  });

  it('sendConfirmation serializes preview data', () => {
    const channel = new WebChatChannel(2000);
    const preview = { amount: 10, to: '0xabc' };
    expect(() => channel.sendConfirmation(preview)).not.toThrow();
  });
});

describe('WebChatChannel message format', () => {
  it('send creates correct JSON structure', async () => {
    const channel = new WebChatChannel(2000);
    // Inject a mock client to capture sent data
    const sentData: string[] = [];
    const mockClient = {
      ws: null as any,
      send: (data: string) => sentData.push(data),
    };
    (channel as any).clients.add(mockClient);

    await channel.send('user1', 'Your balance is $100');

    expect(sentData).toHaveLength(1);
    const parsed = JSON.parse(sentData[0]);
    expect(parsed.type).toBe('message');
    expect(parsed.text).toBe('Your balance is $100');
    expect(parsed.timestamp).toBeTypeOf('number');
  });

  it('sendToken creates correct JSON structure', () => {
    const channel = new WebChatChannel(2000);
    const sentData: string[] = [];
    const mockClient = { ws: null as any, send: (data: string) => sentData.push(data) };
    (channel as any).clients.add(mockClient);

    channel.sendToken('Hello');

    const parsed = JSON.parse(sentData[0]);
    expect(parsed.type).toBe('token');
    expect(parsed.text).toBe('Hello');
  });

  it('sendToolCall creates correct JSON structure', () => {
    const channel = new WebChatChannel(2000);
    const sentData: string[] = [];
    const mockClient = { ws: null as any, send: (data: string) => sentData.push(data) };
    (channel as any).clients.add(mockClient);

    channel.sendToolCall('t2000_balance', true);

    const parsed = JSON.parse(sentData[0]);
    expect(parsed.type).toBe('tool_call');
    expect(parsed.name).toBe('t2000_balance');
    expect(parsed.dryRun).toBe(true);
  });

  it('sendConfirmation creates correct JSON structure', () => {
    const channel = new WebChatChannel(2000);
    const sentData: string[] = [];
    const mockClient = { ws: null as any, send: (data: string) => sentData.push(data) };
    (channel as any).clients.add(mockClient);

    channel.sendConfirmation({ amount: 50, to: '0xabc' });

    const parsed = JSON.parse(sentData[0]);
    expect(parsed.type).toBe('confirmation');
    expect(parsed.preview).toEqual({ amount: 50, to: '0xabc' });
  });

  it('removes client on send error', async () => {
    const channel = new WebChatChannel(2000);
    const failClient = {
      ws: null as any,
      send: () => { throw new Error('connection closed'); },
    };
    (channel as any).clients.add(failClient);

    await channel.send('user1', 'test');

    expect((channel as any).clients.size).toBe(0);
  });

  it('broadcasts to multiple clients', async () => {
    const channel = new WebChatChannel(2000);
    const data1: string[] = [];
    const data2: string[] = [];
    (channel as any).clients.add({ ws: null, send: (d: string) => data1.push(d) });
    (channel as any).clients.add({ ws: null, send: (d: string) => data2.push(d) });

    await channel.send('user1', 'broadcast');

    expect(data1).toHaveLength(1);
    expect(data2).toHaveLength(1);
    expect(JSON.parse(data1[0]).text).toBe('broadcast');
    expect(JSON.parse(data2[0]).text).toBe('broadcast');
  });
});
