import { z } from 'zod';
import { defineTool } from '../v2/define-tool.js';

const PaymentLinkSchema = z.object({
  amount: z.number().positive().describe('Amount in USDC (required). Ask the user if not specified.'),
  label: z.string().optional().describe('Human-readable label e.g. "Consulting fee March"'),
  memo: z.string().optional().describe('Optional note shown to the payer'),
  expiresInHours: z.number().positive().optional().describe('Hours until the link expires. Omit for permanent links.'),
});

const InvoiceSchema = z.object({
  amount: z.number().positive().describe('Total invoice amount in USDC'),
  label: z.string().describe('Invoice title e.g. "Web design — March 2026"'),
  memo: z.string().optional().describe('Optional note or payment terms'),
  recipientName: z.string().optional().describe('Name of the person or company being invoiced'),
  recipientEmail: z.string().optional().describe('Email address of the recipient'),
  dueDays: z.number().int().positive().optional().describe('Days until payment is due. Omit for no due date.'),
  items: z.array(z.object({
    description: z.string(),
    amount: z.number().positive(),
  })).optional().describe('Line items. If omitted, a single line item matching the total is implied.'),
});

function internalHeaders(context: { walletAddress?: string; env?: import('../types.js').ToolContextEnv; signal?: AbortSignal }) {
  const internalKey = context.env?.AUDRIC_INTERNAL_KEY;
  return {
    'Content-Type': 'application/json',
    'x-sui-address': context.walletAddress ?? '',
    ...(internalKey ? { 'x-internal-key': internalKey } : {}),
  };
}

// [S.267 — 2026-05-23] Failure-path observability. Pre-S.267 every tool
// in this file silently returned `{ data: null, displayText: 'Failed…' }`
// on HTTP error or network failure, leaving the LLM to rephrase the
// generic message as "unexpected result." That made auth-threading
// regressions (S.267 itself: AUDRIC_INTERNAL_KEY not threaded through
// audric web-v2's ToolContext.env → 401 → silent failure) invisible
// in production logs. One grep-friendly line per failure surfaces the
// class of bug at the next regression.
function logReceiveFailure(
  tool: string,
  url: string,
  status: number | 'network',
  detail: string,
) {
  console.warn(`[receive] tool=${tool} status=${status} url=${url} detail=${detail}`);
}

export const createPaymentLinkTool = defineTool({
  name: 'create_payment_link',
  description:
    'Create a shareable payment link so someone can send USDC to the user. Amount is required — ask the user for the amount if not specified. Returns a URL the user can share. Payers can connect their wallet, scan a QR code, or send manually. Use when the user says "create a payment link", "generate a payment link", "I want to get paid", or similar.',
  inputSchema: PaymentLinkSchema,
  isReadOnly: true,

  async call(input, context) {
    const apiUrl = context.env?.AUDRIC_INTERNAL_API_URL;
    if (!apiUrl || !context.walletAddress) {
      return { data: null, displayText: 'Payment link creation is not available.' };
    }

    try {
      const res = await fetch(`${apiUrl}/api/internal/payments`, {
        method: 'POST',
        signal: context.signal,
        headers: internalHeaders(context),
        body: JSON.stringify({ ...input, type: 'link' }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        logReceiveFailure('create_payment_link', `${apiUrl}/api/internal/payments`, res.status, err.error ?? '(no body)');
        return { data: null, displayText: err.error ?? 'Failed to create payment link.' };
      }

      const link = await res.json() as {
        slug: string;
        nonce: string;
        url: string;
        amount: number;
        currency: string;
        label: string | null;
        memo: string | null;
        expiresAt: string | null;
      };

      const amountStr = `$${link.amount.toFixed(2)} ${link.currency}`;
      return {
        data: link,
        displayText: `Payment link created for ${amountStr}${link.label ? ` — ${link.label}` : ''}. Payers can connect their wallet, scan the QR code, or send manually. Share: ${link.url}`,
      };
    } catch (e) {
      logReceiveFailure('create_payment_link', `${apiUrl}/api/internal/payments`, 'network', e instanceof Error ? e.message : String(e));
      return { data: null, displayText: 'Failed to create payment link.' };
    }
  },
});

export const listPaymentLinksTool = defineTool({
  name: 'list_payment_links',
  description:
    'List the user\'s payment links — active, paid, expired, and cancelled. Use when the user asks "show my payment links", "what payment links do I have", or wants to check payment status.',
  inputSchema: z.object({}),
  isReadOnly: true,

  async call(_input, context) {
    const apiUrl = context.env?.AUDRIC_INTERNAL_API_URL;
    if (!apiUrl || !context.walletAddress) {
      return { data: { links: [] }, displayText: 'No payment links found.' };
    }

    try {
      const res = await fetch(`${apiUrl}/api/internal/payments?type=link`, {
        signal: context.signal,
        headers: internalHeaders(context),
      });

      if (!res.ok) {
        logReceiveFailure('list_payment_links', `${apiUrl}/api/internal/payments?type=link`, res.status, '(no body parse on list path)');
        return { data: { links: [] }, displayText: 'Could not fetch payment links.' };
      }

      const raw = await res.json() as { payments: unknown[] };
      const links = raw.payments;
      const count = links.length;
      return {
        data: { links },
        displayText: count === 0 ? 'No payment links yet.' : `${count} payment link${count !== 1 ? 's' : ''} found.`,
      };
    } catch (e) {
      logReceiveFailure('list_payment_links', `${apiUrl}/api/internal/payments?type=link`, 'network', e instanceof Error ? e.message : String(e));
      return { data: { links: [] }, displayText: 'Could not fetch payment links.' };
    }
  },
});

export const createInvoiceTool = defineTool({
  name: 'create_invoice',
  description:
    'Create a formal invoice that the user can share with a client or customer. Returns a URL for the invoice page. Payers can connect their wallet, scan a QR code, or send manually. Use when the user says "create an invoice", "generate an invoice", "bill a client", or similar.',
  inputSchema: InvoiceSchema,
  isReadOnly: true,

  async call(input, context) {
    const apiUrl = context.env?.AUDRIC_INTERNAL_API_URL;
    if (!apiUrl || !context.walletAddress) {
      return { data: null, displayText: 'Invoice creation is not available.' };
    }

    try {
      const res = await fetch(`${apiUrl}/api/internal/payments`, {
        method: 'POST',
        signal: context.signal,
        headers: internalHeaders(context),
        body: JSON.stringify({ ...input, type: 'invoice' }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        logReceiveFailure('create_invoice', `${apiUrl}/api/internal/payments`, res.status, err.error ?? '(no body)');
        return { data: null, displayText: err.error ?? 'Failed to create invoice.' };
      }

      const invoice = await res.json() as {
        slug: string;
        nonce: string;
        url: string;
        amount: number;
        currency: string;
        label: string;
        memo: string | null;
        dueDate: string | null;
      };

      const dueStr = invoice.dueDate ? ` due ${new Date(invoice.dueDate).toLocaleDateString()}` : '';
      return {
        data: invoice,
        displayText: `Invoice created for $${invoice.amount.toFixed(2)} ${invoice.currency}${dueStr} — ${invoice.label}. Payers can connect their wallet, scan the QR code, or send manually. Share: ${invoice.url}`,
      };
    } catch (e) {
      logReceiveFailure('create_invoice', `${apiUrl}/api/internal/payments`, 'network', e instanceof Error ? e.message : String(e));
      return { data: null, displayText: 'Failed to create invoice.' };
    }
  },
});

export const cancelPaymentLinkTool = defineTool({
  name: 'cancel_payment_link',
  description:
    'Cancel an active payment link so it can no longer be used. Use when the user says "cancel my payment link", "delete my payment link", or "remove the link [slug/label]". Ask for the slug if ambiguous — use list_payment_links first to find it.',
  inputSchema: z.object({
    slug: z.string().describe('The slug of the payment link to cancel (e.g. "LzLawhY7")'),
  }),
  isReadOnly: true,

  async call(input, context) {
    const apiUrl = context.env?.AUDRIC_INTERNAL_API_URL;
    if (!apiUrl || !context.walletAddress) {
      return { data: null, displayText: 'Payment link cancellation is not available.' };
    }

    try {
      const res = await fetch(`${apiUrl}/api/internal/payments`, {
        method: 'PATCH',
        signal: context.signal,
        headers: internalHeaders(context),
        body: JSON.stringify({ slug: input.slug, action: 'cancel' }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        logReceiveFailure('cancel_payment_link', `${apiUrl}/api/internal/payments`, res.status, err.error ?? '(no body)');
        return { data: null, displayText: err.error ?? 'Failed to cancel payment link.' };
      }

      const result = await res.json() as { slug: string; status: string };
      return {
        data: result,
        displayText: `Payment link ${result.slug} cancelled.`,
      };
    } catch (e) {
      logReceiveFailure('cancel_payment_link', `${apiUrl}/api/internal/payments`, 'network', e instanceof Error ? e.message : String(e));
      return { data: null, displayText: 'Failed to cancel payment link.' };
    }
  },
});

export const cancelInvoiceTool = defineTool({
  name: 'cancel_invoice',
  description:
    'Cancel an invoice that has not yet been paid. Use when the user says "cancel my invoice", "delete invoice", or refers to a specific invoice slug or label. Use list_invoices first if the slug is not known.',
  inputSchema: z.object({
    slug: z.string().describe('The slug of the invoice to cancel (e.g. "xFYKBWy5")'),
  }),
  isReadOnly: true,

  async call(input, context) {
    const apiUrl = context.env?.AUDRIC_INTERNAL_API_URL;
    if (!apiUrl || !context.walletAddress) {
      return { data: null, displayText: 'Invoice cancellation is not available.' };
    }

    try {
      const res = await fetch(`${apiUrl}/api/internal/payments`, {
        method: 'PATCH',
        signal: context.signal,
        headers: internalHeaders(context),
        body: JSON.stringify({ slug: input.slug, action: 'cancel' }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        logReceiveFailure('cancel_invoice', `${apiUrl}/api/internal/payments`, res.status, err.error ?? '(no body)');
        return { data: null, displayText: err.error ?? 'Failed to cancel invoice.' };
      }

      const result = await res.json() as { slug: string; status: string };
      return {
        data: result,
        displayText: `Invoice ${result.slug} cancelled.`,
      };
    } catch (e) {
      logReceiveFailure('cancel_invoice', `${apiUrl}/api/internal/payments`, 'network', e instanceof Error ? e.message : String(e));
      return { data: null, displayText: 'Failed to cancel invoice.' };
    }
  },
});

export const listInvoicesTool = defineTool({
  name: 'list_invoices',
  description:
    'List the user\'s invoices — pending, overdue, paid, and cancelled. Use when the user asks "show my invoices", "what invoices do I have", or wants to check invoice status.',
  inputSchema: z.object({}),
  isReadOnly: true,

  async call(_input, context) {
    const apiUrl = context.env?.AUDRIC_INTERNAL_API_URL;
    if (!apiUrl || !context.walletAddress) {
      return { data: { invoices: [] }, displayText: 'No invoices found.' };
    }

    try {
      const res = await fetch(`${apiUrl}/api/internal/payments?type=invoice`, {
        signal: context.signal,
        headers: internalHeaders(context),
      });

      if (!res.ok) {
        logReceiveFailure('list_invoices', `${apiUrl}/api/internal/payments?type=invoice`, res.status, '(no body parse on list path)');
        return { data: { invoices: [] }, displayText: 'Could not fetch invoices.' };
      }

      const raw = await res.json() as { payments: unknown[] };
      const invoices = raw.payments;
      const count = invoices.length;
      return {
        data: { invoices },
        displayText: count === 0 ? 'No invoices yet.' : `${count} invoice${count !== 1 ? 's' : ''} found.`,
      };
    } catch (e) {
      logReceiveFailure('list_invoices', `${apiUrl}/api/internal/payments?type=invoice`, 'network', e instanceof Error ? e.message : String(e));
      return { data: { invoices: [] }, displayText: 'Could not fetch invoices.' };
    }
  },
});
