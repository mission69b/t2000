// @t2000/x402 — the x402 payment dialect for Sui, one entry point
// (SPEC_T2_X402_MONOREPO). Seeded from @suimpp/mpp's ./x402 surface plus the
// shared bits @t2000/serve needs (DigestStore, InMemoryDigestStore, USDC
// currencies) — deliberately WITHOUT the mppx pay loop (Method / Credential /
// Receipt / WWW-Authenticate live in mppx + @suimpp/mpp only).
//
// Wire format is the protocol SSOT and is UNCHANGED here: scheme `exact`,
// the X-PAYMENT / X-PAYMENT-RESPONSE headers, and the `extra.suimpp` field
// names stay exactly as `@suimpp/mpp` speaks them — package branding never
// touches the wire. Protocol mirrors remain published as @suimpp/mpp;
// this package is the SSOT for the t2000 stack.

export {
  SUI_USDC_TESTNET_TYPE,
  SUI_USDC_TYPE,
  USDC,
  USDC_TESTNET,
  type Currency,
} from './constants.js';
export {
  InMemoryDigestStore,
  type DigestStore,
  type PaymentReport,
} from './store.js';
export { parseAmountToRaw, withRetry } from './utils.js';
export {
  buildX402SignedPayment,
  challengeNonce,
  createX402Requirements,
  encodeX402Header,
  encodeX402Response,
  isX402EscrowHeader,
  isX402EscrowRequirements,
  parseX402Header,
  settleX402Payment,
  verifyX402Payment,
  X402_PAYMENT_HEADER,
  X402_PAYMENT_RESPONSE_HEADER,
  X402_SCHEME,
  X402_VERSION,
  x402Network,
  type BuildSignedPaymentOptions,
  type CreateRequirementsOptions,
  type SettleX402Options,
  type VerifyX402Options,
  type X402EscrowRequirements,
  type X402EscrowTerms,
  type X402Network,
  type X402PaymentPayload,
  type X402Requirements,
  type X402SettleResponse,
} from './x402.js';
