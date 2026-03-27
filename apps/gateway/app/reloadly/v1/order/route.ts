import { chargeCustom, fetchWithRetry } from '@/lib/gateway';
import { getReloadlyToken, RELOADLY_BASE, reloadlyHeaders, SERVICE_FEE_RATE } from '@/lib/reloadly';

interface OrderBody {
  productId: number;
  countryCode: string;
  quantity: number;
  unitPrice: number;
  customIdentifier?: string;
  senderName?: string;
  recipientEmail?: string;
  recipientPhoneDetails?: { countryCode: string; phoneNumber: string };
}

interface ReloadlyProduct {
  productId: number;
  productName: string;
  denominationType: 'FIXED' | 'RANGE';
  fixedRecipientDenominations?: number[];
  minRecipientDenomination?: number;
  maxRecipientDenomination?: number;
}

/**
 * Pre-validate the order against Reloadly's catalog BEFORE returning a 402.
 * This ensures the user never pays for an order that will be rejected.
 */
async function validateProduct(body: OrderBody): Promise<void> {
  const token = await getReloadlyToken();
  const res = await fetch(`${RELOADLY_BASE}/products/${body.productId}`, {
    method: 'GET',
    headers: reloadlyHeaders(token),
  });

  if (!res.ok) {
    throw new Error(`Product ${body.productId} not found — browse gift cards to find valid products`);
  }

  const product = (await res.json()) as ReloadlyProduct;

  if (product.denominationType === 'FIXED') {
    const valid = product.fixedRecipientDenominations ?? [];
    if (!valid.includes(body.unitPrice)) {
      throw new Error(
        `${product.productName} only available in fixed amounts: ${valid.join(', ')}. ` +
        `You requested ${body.unitPrice}.`,
      );
    }
  } else if (product.denominationType === 'RANGE') {
    const min = product.minRecipientDenomination ?? 0;
    const max = product.maxRecipientDenomination ?? Infinity;
    if (body.unitPrice < min || body.unitPrice > max) {
      throw new Error(
        `${product.productName} requires amount between ${min} and ${max}. ` +
        `You requested ${body.unitPrice}.`,
      );
    }
  }
}

export const POST = chargeCustom(
  async (bodyText) => {
    const body = JSON.parse(bodyText) as OrderBody;

    if (!body.productId || typeof body.productId !== 'number' || !Number.isInteger(body.productId)) {
      throw new Error('productId must be a valid integer (use browse endpoint first)');
    }
    if (!body.unitPrice || typeof body.unitPrice !== 'number' || body.unitPrice <= 0) {
      throw new Error('unitPrice must be a positive number');
    }
    if (body.unitPrice > 100) {
      throw new Error('unitPrice cannot exceed $100 per order');
    }

    await validateProduct(body);

    const quantity = body.quantity ?? 1;
    const total = body.unitPrice * quantity * (1 + SERVICE_FEE_RATE);
    return total.toFixed(2);
  },

  async (bodyText) => {
    const token = await getReloadlyToken();

    return fetchWithRetry(
      `${RELOADLY_BASE}/orders`,
      {
        method: 'POST',
        headers: reloadlyHeaders(token),
        body: bodyText,
      },
    );
  },
);
