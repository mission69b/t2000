import { describe, it, expect } from 'vitest';
import { createPaymentLinkTool, createInvoiceTool, listPaymentLinksTool, cancelPaymentLinkTool, listInvoicesTool, cancelInvoiceTool } from '../tools/receive.js';

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
    const result = createPaymentLinkTool.inputSchema.safeParse({ amount: 25.50 });
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
});

describe('create_invoice tool — contract', () => {
  it('has correct name', () => {
    expect(createInvoiceTool.name).toBe('create_invoice');
  });

  it('requires amount and label in JSON schema', () => {
    const required = createInvoiceTool.jsonSchema.required as string[];
    expect(required).toContain('amount');
    expect(required).toContain('label');
  });

  it('amount must be positive', () => {
    const result = createInvoiceTool.inputSchema.safeParse({ amount: 0, label: 'Test' });
    expect(result.success).toBe(false);
  });

  it('accepts valid invoice input', () => {
    const result = createInvoiceTool.inputSchema.safeParse({
      amount: 500,
      label: 'Web Design - Q1',
      memo: 'Net 30',
      recipientName: 'Acme Corp',
      recipientEmail: 'billing@acme.com',
      dueDays: 30,
      items: [
        { description: 'Homepage redesign', amount: 300 },
        { description: 'SEO audit', amount: 200 },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('list / cancel tools — contract', () => {
  it('list_payment_links is read-only', () => {
    expect(listPaymentLinksTool.isReadOnly).toBe(true);
  });

  it('cancel_payment_link is read-only (API call, not on-chain)', () => {
    expect(cancelPaymentLinkTool.isReadOnly).toBe(true);
  });

  it('list_invoices is read-only', () => {
    expect(listInvoicesTool.isReadOnly).toBe(true);
  });

  it('cancel_invoice is read-only', () => {
    expect(cancelInvoiceTool.isReadOnly).toBe(true);
  });
});
