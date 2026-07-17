/**
 * Abstract signing interface that decouples the SDK from any specific
 * key management strategy (Ed25519 keypair, zkLogin, multisig, …).
 */
export interface TransactionSigner {
  getAddress(): string;
  signTransaction(txBytes: Uint8Array): Promise<{ signature: string }>;
  /**
   * Sign an arbitrary personal message. Required by `@suimpp/mpp` 0.7+ for
   * grief-protection proofs (sender identity verification on settled payments).
   */
  signPersonalMessage(messageBytes: Uint8Array): Promise<{ signature: string; bytes?: string }>;
  /**
   * Signature scheme marker. zkLogin personal-message signatures are ZK
   * constructs that only Sui-aware verifiers can check — external x402
   * sellers (the MPP header dialect verifies the payer's personal signature
   * SELLER-side) reject them AFTER the on-chain payment already settled
   * (live finding, JMPR 2026-07-17: charged, no delivery). `payWithMpp`
   * fails closed on `'zklogin'` + header-only 402 BEFORE any money moves.
   * Optional so external signer impls keep compiling; undefined = keypair
   * semantics.
   */
  readonly kind?: 'keypair' | 'zklogin';
}
