import { describe, it, expect } from 'vitest';
import { createPaymentLinkTool, listPaymentLinksTool, cancelPaymentLinkTool } from '../tools/receive.js';

describe('create_payment_link tool — contract', () => {
  it('has correct name', () => {
    expect(createPaymentLinkTool.name).toBe('create_payment_link');
  });

  it('is a read-only tool (auto permission — no on-chain tx)', () => {
    expect(createPaymentLinkTool.isReadOnly).toBe(true);
  });

  it('requires amount in JSON schema', () => {
    const required = createPaymentLinkTool.jsonSchema.required as string[];
    expect(required).toContain('amount');
  });

  it('amount is required in Zod schema (rejects missing amount)', () => {
    const result = createPaymentLinkTool.inputSchema.safeParse({ label: 'test' });
    expect(result.success).toBe(false);
  });

  it('amount must be positive in Zod schema', () => {
    const zero = createPaymentLinkTool.inputSchema.safeParse({ amount: 0 });
    expect(zero.success).toBe(false);

    const negative = createPaymentLinkTool.inputSchema.safeParse({ amount: -5 });
    expect(negative.success).toBe(false);
  });

  it('accepts valid input with amount', () => {
    // [P2.1 — 2026-05-24] label/memo/expiresInHours converted from
    // `.optional()` to `.nullable()` for OpenAI strict-mode / Qwen-with-
    // constrained-decoding compatibility. They're now required-but-nullable.
    const result = createPaymentLinkTool.inputSchema.safeParse({
      amount: 25.50,
      label: null,
      memo: null,
      expiresInHours: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts all optional fields', () => {
    const result = createPaymentLinkTool.inputSchema.safeParse({
      amount: 100,
      label: 'Consulting fee',
      memo: 'March 2026',
      expiresInHours: 48,
    });
    expect(result.success).toBe(true);
  });

  it('description instructs LLM to ask for amount', () => {
    expect(createPaymentLinkTool.description).toMatch(/ask the user/i);
  });

  // [V07E_INVOICE_DEPRECATION / S.269 item 7 — 2026-05-23] Payment links
  // absorb the invoicing use case post-v0.7e — confirm the description
  // tells the LLM to call this tool for invoice intents, so prompts
  // like "create an invoice" / "bill a client" don't fall through.
  it('description routes invoice intents to this tool', () => {
    expect(createPaymentLinkTool.description).toMatch(/invoice|bill/i);
  });
});

describe('list / cancel tools — contract', () => {
  it('list_payment_links is read-only', () => {
    expect(listPaymentLinksTool.isReadOnly).toBe(true);
  });

  it('cancel_payment_link is read-only (API call, not on-chain)', () => {
    expect(cancelPaymentLinkTool.isReadOnly).toBe(true);
  });

  // [V07E_INVOICE_DEPRECATION / S.269 item 7 — 2026-05-23]
  it('list_payment_links description routes invoice intents to this tool', () => {
    expect(listPaymentLinksTool.description).toMatch(/invoice/i);
  });

  it('cancel_payment_link description routes invoice intents to this tool', () => {
    expect(cancelPaymentLinkTool.description).toMatch(/invoice/i);
  });
});
