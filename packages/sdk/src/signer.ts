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
}
