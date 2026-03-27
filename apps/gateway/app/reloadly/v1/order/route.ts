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

export const POST = chargeCustom(
  (bodyText) => {
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
