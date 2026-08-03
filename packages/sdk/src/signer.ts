/**
 * Abstract signing interface that decouples the SDK from any specific
 * key management strategy (Ed25519 keypair, zkLogin, multisig, …).
 */
export interface TransactionSigner {
  getAddress(): string;
  signTransaction(txBytes: Uint8Array): Promise<{ signature: string }>;
  /**
   * Sign an arbitrary personal message — used for off-chain proofs bound to
   * the wallet (e.g. signed job-review submissions).
   */
  signPersonalMessage(messageBytes: Uint8Array): Promise<{ signature: string; bytes?: string }>;
  /**
   * Signature scheme marker. zkLogin personal-message signatures are ZK
   * constructs only Sui-aware verifiers can check — hosts use this to gate
   * flows that depend on seller-side signature verification. Optional so
   * external signer impls keep compiling; undefined = keypair semantics.
   */
  readonly kind?: 'keypair' | 'zklogin';
}
