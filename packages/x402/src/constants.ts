/**
 * Sui Payment Kit package ID (mainnet).
 * Source: sui-payment-kit repo Move.lock `published-at` field.
 * Namespace: 0xccd3e4c7802921991cd9ce488c4ca0b51334ba75483702744242284ccf3ae7c2
 */
export const PAYMENT_KIT_PACKAGE =
  process.env.PAYMENT_KIT_PACKAGE ??
  '0xccd3e4c7802921991cd9ce488c4ca0b51334ba75483702744242284ccf3ae7c2';

/**
 * t2000's PaymentRegistry object ID (mainnet).
 * Created once via `create_registry<USDC>` during deployment setup.
 * Must be set before x402 can function.
 */
export const T2000_PAYMENT_REGISTRY_ID =
  process.env.T2000_PAYMENT_REGISTRY_ID ?? '';

export const USDC_TYPE =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

export const CLOCK_ID = '0x6';

export const DEFAULT_FACILITATOR_URL = 'https://api.t2000.ai/x402';

export const PAYMENT_KIT_MODULE = 'payment_kit';
export const PAYMENT_KIT_FUNCTION = 'process_registry_payment';
export const PAYMENT_EVENT_TYPE = `${PAYMENT_KIT_PACKAGE}::${PAYMENT_KIT_MODULE}::PaymentEvent`;
