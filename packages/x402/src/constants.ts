/**
 * Sui Payment Kit package ID (mainnet).
 * Source: github.com/MystenLabs/sui-payment-kit Move.lock `original-published-id`.
 */
export const PAYMENT_KIT_PACKAGE =
  process.env.PAYMENT_KIT_PACKAGE ??
  '0xbc126f1535fba7d641cb9150ad9eae93b104972586ba20f3c60bfe0e53b69bc6';

/**
 * t2000's PaymentRegistry object ID (mainnet).
 * Created via `create_registry` on Payment Kit Namespace.
 * Tx: 666ZX1PhfV3PVJtqVZfuToHoVGoTDeWCxzZb1u8aRgmL
 */
export const T2000_PAYMENT_REGISTRY_ID =
  process.env.T2000_PAYMENT_REGISTRY_ID ??
  '0x4009dd17305ed1b33352b808e9d0e9eb94d09085b2d5ec0f395c5cdfa2271291';

export const USDC_TYPE =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

export const CLOCK_ID = '0x6';

export const DEFAULT_FACILITATOR_URL = 'https://api.t2000.ai/x402';

export const PAYMENT_KIT_MODULE = 'payment_kit';
export const PAYMENT_KIT_FUNCTION = 'process_registry_payment';
export const PAYMENT_RECEIPT_EVENT_TYPE = `${PAYMENT_KIT_PACKAGE}::${PAYMENT_KIT_MODULE}::PaymentReceipt`;
