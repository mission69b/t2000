import { createHash, createHmac } from 'node:crypto';
import { env } from '@/lib/env';

// Delivery-leg authentication. The commerce delivery (app/commerce/pay/[seller])
// injects a signed `x-t2000-delivery` header on EVERY delivery: `<ts>.<sig>`
// where sig = HMAC-SHA256(key, `${ts}|${target origin+path}`).
//
// Properties:
// - No per-seller secrets to distribute — the key derives from INTERNAL_API_KEY.
// - Binding to the TARGET URL means a malicious seller who logs the header on
//   their own deliveries cannot replay it elsewhere (path mismatch), and
//   freshness bounds any replay window.
// - Sellers verify presence + signature to prove the call came through the
//   paid delivery leg (documented in the delivery contract).

export const DELIVERY_AUTH_HEADER = 'x-t2000-delivery';

function deliveryKey(): Buffer {
  return createHash('sha256')
    .update(`${env.INTERNAL_API_KEY}:delivery-auth-v1`)
    .digest();
}

/** Normalize a URL to the signed surface: lowercase origin + pathname (query
 *  excluded — buyer input rides the body and must not break the bind). */
function signedTarget(rawUrl: string): string {
  const u = new URL(rawUrl);
  return `${u.origin.toLowerCase()}${u.pathname.toLowerCase()}`;
}

/** Sign a delivery to `targetUrl` (called by the commerce delivery leg). */
export function signDelivery(targetUrl: string, now = Date.now()): string {
  const sig = createHmac('sha256', deliveryKey())
    .update(`${now}|${signedTarget(targetUrl)}`)
    .digest('hex');
  return `${now}.${sig}`;
}
