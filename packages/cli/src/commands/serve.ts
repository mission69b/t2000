import type { Command } from 'commander';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { T2000 } from '@t2000/sdk';
import { askPassphrase, getPassphraseFromEnv } from '../prompts.js';
import { handleError } from '../output.js';
import { streamSSE } from 'hono/streaming';

const CONFIG_DIR = join(homedir(), '.t2000');
const TOKEN_PATH = join(CONFIG_DIR, 'config.json');

function generateToken(): string {
  return `t2k_${randomBytes(24).toString('hex')}`;
}

function saveToken(token: string): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(readFileSync(TOKEN_PATH, 'utf-8'));
  } catch { /* empty */ }
  config.authToken = token;
  writeFileSync(TOKEN_PATH, JSON.stringify(config, null, 2) + '\n');
}

function envelope(data: unknown) {
  return { success: true, data, timestamp: Math.floor(Date.now() / 1000) };
}

function errorResponse(code: string, message: string, data?: unknown, retryable = false) {
  return {
    success: false,
    error: { code, message, data, retryable },
    timestamp: Math.floor(Date.now() / 1000),
  };
}

export function registerServe(program: Command) {
  program
    .command('serve')
    .description('Start HTTP API server')
    .option('--port <port>', 'Port number', '3001')
    .option('--rate-limit <rps>', 'Max requests per second', '10')
    .option('--key <path>', 'Key file path')
    .action(async (opts: { port: string; rateLimit: string; key?: string }) => {
      try {
        const passphrase = getPassphraseFromEnv() ?? await askPassphrase();
        const agent = await T2000.create({ passphrase, keyPath: opts.key });
        const port = parseInt(opts.port, 10);
        const rateLimit = parseInt(opts.rateLimit, 10);

        const token = generateToken();
        saveToken(token);

        const app = buildApp(agent, token, rateLimit);

        serve({ fetch: app.fetch, port });

        console.log(`  ✓ API server running on http://localhost:${port}`);
        console.log(`  ✓ Auth token: ${token}`);
        console.log('');
        console.log('  Endpoints:');
        console.log('    GET  /v1/balance        POST /v1/send');
        console.log('    GET  /v1/address         POST /v1/save');
        console.log('    GET  /v1/history         POST /v1/withdraw');
        console.log('    GET  /v1/earnings        POST /v1/swap');
        console.log('    GET  /v1/rates           POST /v1/borrow');
        console.log('    GET  /v1/health-factor   POST /v1/repay');
        console.log('    GET  /v1/positions');
        console.log('    GET  /v1/events          (SSE)');
        console.log('');
      } catch (error) {
        handleError(error);
      }
    });
}

function buildApp(agent: T2000, authToken: string, rateLimit: number): Hono {
  const app = new Hono();

  app.use('*', cors());

  // Rate limiting (sliding window)
  const requestLog: number[] = [];
  app.use('/v1/*', async (c, next) => {
    const now = Date.now();
    const windowMs = 1000;
    while (requestLog.length > 0 && requestLog[0]! < now - windowMs) {
      requestLog.shift();
    }
    if (requestLog.length >= rateLimit) {
      c.status(429);
      c.header('Retry-After', '1');
      return c.json(errorResponse('RATE_LIMITED', 'Too many requests', null, true));
    }
    requestLog.push(now);
    await next();
  });

  // Bearer auth
  app.use('/v1/*', async (c, next) => {
    const auth = c.req.header('Authorization');
    if (!auth || auth !== `Bearer ${authToken}`) {
      c.status(401);
      return c.json(errorResponse('UNAUTHORIZED', 'Invalid or missing Bearer token'));
    }
    await next();
  });

  // --- GET endpoints ---

  app.get('/v1/address', (c) => {
    return c.json(envelope({ address: agent.address }));
  });

  app.get('/v1/balance', async (c) => {
    try {
      const balance = await agent.balance();
      return c.json(envelope(balance));
    } catch (err) {
      return c.json(errorResponse('BALANCE_ERROR', errMsg(err)), 500);
    }
  });

  app.get('/v1/history', async (c) => {
    try {
      const limit = parseInt(c.req.query('limit') ?? '20', 10);
      const history = await agent.history({ limit });
      return c.json(envelope(history));
    } catch (err) {
      return c.json(errorResponse('HISTORY_ERROR', errMsg(err)), 500);
    }
  });

  app.get('/v1/deposit', (c) => {
    return c.json(envelope({
      address: agent.address,
      network: 'mainnet',
      instructions: 'Send USDC to this address on Sui mainnet.',
    }));
  });

  app.get('/v1/earnings', async (c) => {
    try {
      const earnings = await agent.earnings();
      return c.json(envelope(earnings));
    } catch (err) {
      return c.json(errorResponse('EARNINGS_ERROR', errMsg(err)), 500);
    }
  });

  app.get('/v1/rates', async (c) => {
    try {
      const rates = await agent.rates();
      return c.json(envelope(rates));
    } catch (err) {
      return c.json(errorResponse('RATES_ERROR', errMsg(err)), 500);
    }
  });

  app.get('/v1/health-factor', async (c) => {
    try {
      const hf = await agent.healthFactor();
      return c.json(envelope(hf));
    } catch (err) {
      return c.json(errorResponse('HEALTH_ERROR', errMsg(err)), 500);
    }
  });

  app.get('/v1/max-withdraw', async (c) => {
    try {
      const result = await agent.maxWithdraw();
      return c.json(envelope(result));
    } catch (err) {
      return c.json(errorResponse('MAX_WITHDRAW_ERROR', errMsg(err)), 500);
    }
  });

  app.get('/v1/max-borrow', async (c) => {
    try {
      const result = await agent.maxBorrow();
      return c.json(envelope(result));
    } catch (err) {
      return c.json(errorResponse('MAX_BORROW_ERROR', errMsg(err)), 500);
    }
  });

  app.get('/v1/positions', async (c) => {
    try {
      const positions = await agent.positions();
      return c.json(envelope(positions));
    } catch (err) {
      return c.json(errorResponse('POSITIONS_ERROR', errMsg(err)), 500);
    }
  });

  // --- POST endpoints ---

  app.post('/v1/send', async (c) => {
    try {
      const body = await c.req.json();
      const { to, amount, asset } = body as { to: string; amount: number; asset?: string };
      if (!to || !amount) {
        c.status(400);
        return c.json(errorResponse('INVALID_PARAMS', 'Required: to, amount'));
      }
      const result = await agent.send({ to, amount, asset: asset ?? 'USDC' });
      return c.json(envelope(result));
    } catch (err) {
      c.status(getStatusCode(err) as 400 | 500);
      return c.json(handleApiError(err));
    }
  });

  app.post('/v1/save', async (c) => {
    try {
      const body = await c.req.json();
      const { amount, asset } = body as { amount: number; asset?: string };
      if (!amount) {
        c.status(400);
        return c.json(errorResponse('INVALID_PARAMS', 'Required: amount'));
      }
      const result = await agent.save({ amount, asset: asset ?? 'USDC' });
      return c.json(envelope(result));
    } catch (err) {
      c.status(getStatusCode(err) as 400 | 500);
      return c.json(handleApiError(err));
    }
  });

  app.post('/v1/supply', async (c) => {
    try {
      const body = await c.req.json();
      const { amount, asset } = body as { amount: number; asset?: string };
      if (!amount) {
        c.status(400);
        return c.json(errorResponse('INVALID_PARAMS', 'Required: amount'));
      }
      const result = await agent.save({ amount, asset: asset ?? 'USDC' });
      return c.json(envelope(result));
    } catch (err) {
      c.status(getStatusCode(err) as 400 | 500);
      return c.json(handleApiError(err));
    }
  });

  app.post('/v1/withdraw', async (c) => {
    try {
      const body = await c.req.json();
      const { amount, asset } = body as { amount: number | 'all'; asset?: string };
      if (!amount) {
        c.status(400);
        return c.json(errorResponse('INVALID_PARAMS', 'Required: amount'));
      }
      const result = await agent.withdraw({ amount, asset: asset ?? 'USDC' });
      return c.json(envelope(result));
    } catch (err) {
      c.status(getStatusCode(err) as 400 | 500);
      return c.json(handleApiError(err));
    }
  });

  app.post('/v1/swap', async (c) => {
    try {
      const body = await c.req.json();
      const { from, to, amount, maxSlippage } = body as { from: string; to: string; amount: number; maxSlippage?: number };
      if (!from || !to || !amount) {
        c.status(400);
        return c.json(errorResponse('INVALID_PARAMS', 'Required: from, to, amount'));
      }
      const result = await agent.swap({ from, to, amount, maxSlippage });
      return c.json(envelope(result));
    } catch (err) {
      c.status(getStatusCode(err) as 400 | 500);
      return c.json(handleApiError(err));
    }
  });

  app.post('/v1/borrow', async (c) => {
    try {
      const body = await c.req.json();
      const { amount, asset } = body as { amount: number; asset?: string };
      if (!amount) {
        c.status(400);
        return c.json(errorResponse('INVALID_PARAMS', 'Required: amount'));
      }
      const result = await agent.borrow({ amount, asset: asset ?? 'USDC' });
      return c.json(envelope(result));
    } catch (err) {
      c.status(getStatusCode(err) as 400 | 500);
      return c.json(handleApiError(err));
    }
  });

  app.post('/v1/repay', async (c) => {
    try {
      const body = await c.req.json();
      const { amount, asset } = body as { amount: number | 'all'; asset?: string };
      if (!amount) {
        c.status(400);
        return c.json(errorResponse('INVALID_PARAMS', 'Required: amount'));
      }
      const result = await agent.repay({ amount, asset: asset ?? 'USDC' });
      return c.json(envelope(result));
    } catch (err) {
      c.status(getStatusCode(err) as 400 | 500);
      return c.json(handleApiError(err));
    }
  });

  // --- SSE endpoint ---

  app.get('/v1/events', async (c) => {
    const subscribeParam = c.req.query('subscribe') ?? 'yield,balanceChange,healthWarning';
    const subscriptions = new Set(subscribeParam.split(',').map((s) => s.trim()));

    return streamSSE(c, async (stream) => {
      const handlers: Array<{ event: string; off: () => void }> = [];

      for (const eventName of subscriptions) {
        const handler = (data: unknown) => {
          stream.writeSSE({ event: eventName, data: JSON.stringify(data) }).catch(() => {});
        };
        agent.on(eventName as never, handler as never);
        handlers.push({
          event: eventName,
          off: () => agent.off(eventName as never, handler as never),
        });
      }

      // Keep alive
      const keepAlive = setInterval(() => {
        stream.writeSSE({ event: 'ping', data: '{}' }).catch(() => {});
      }, 30_000);

      stream.onAbort(() => {
        clearInterval(keepAlive);
        for (const h of handlers) h.off();
      });

      // Block forever — SSE streams stay open
      await new Promise<void>(() => {});
    });
  });

  return app;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function handleApiError(err: unknown) {
  const t2kErr = err as { code?: string; message?: string; data?: unknown };
  return errorResponse(
    t2kErr.code ?? 'UNKNOWN',
    t2kErr.message ?? errMsg(err),
    t2kErr.data,
    isRetryable(t2kErr.code),
  );
}

function getStatusCode(err: unknown): number {
  const code = (err as { code?: string }).code;
  if (!code) return 500;
  if (code === 'INSUFFICIENT_BALANCE') return 400;
  if (code === 'INVALID_ADDRESS') return 400;
  if (code === 'WITHDRAW_WOULD_LIQUIDATE') return 400;
  if (code === 'NO_COLLATERAL') return 400;
  return 500;
}

function isRetryable(code?: string): boolean {
  if (!code) return false;
  return ['RPC_ERROR', 'RPC_UNREACHABLE', 'SPONSOR_UNAVAILABLE', 'AUTO_TOPUP_FAILED'].includes(code);
}
