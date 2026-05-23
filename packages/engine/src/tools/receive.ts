import { z } from 'zod';
import { defineTool } from '../v2/define-tool.js';

const PaymentLinkSchema = z.object({
  amount: z.number().positive().describe('Amount in USDC (required). Ask the user if not specified.'),
  label: z.string().nullable().describe('Human-readable label e.g. "Consulting fee March". Pass null for an unlabelled link.'),
  memo: z.string().nullable().describe('Optional note shown to the payer. Pass null when no memo is needed.'),
  expiresInHours: z.number().positive().nullable().describe('Hours until the link expires. Pass null for permanent links.'),
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
    'Create a shareable payment link so someone can send USDC to the user. Amount is required — ask the user for the amount if not specified. Returns a URL the user can share. Payers can connect their wallet, scan a QR code, or send manually. Use when the user says "create a payment link", "generate a payment link", "I want to get paid", "create an invoice", "bill a client", "send an invoice", or similar — payment links cover the invoicing use case. Set the label/memo to encode invoice context (e.g. label="Web design — March 2026", memo="Net 30").',
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
    'List the user\'s payment links — active, paid, expired, and cancelled. Use when the user asks "show my payment links", "show my invoices", "what payment links do I have", or wants to check payment / invoice status. Payment links cover the invoicing use case (use create_payment_link for any "bill a client" or "send an invoice" intent).',
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

export const cancelPaymentLinkTool = defineTool({
  name: 'cancel_payment_link',
  description:
    'Cancel an active payment link so it can no longer be used. Use when the user says "cancel my payment link", "delete my payment link", "cancel my invoice", "delete invoice", or "remove the link [slug/label]". Ask for the slug if ambiguous — use list_payment_links first to find it. (Payment links cover the invoicing use case post-V07E_INVOICE_DEPRECATION.)',
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
