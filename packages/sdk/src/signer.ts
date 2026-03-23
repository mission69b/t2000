/**
 * Abstract signing interface that decouples the SDK from any specific
 * key management strategy (Ed25519 keypair, zkLogin, multisig, …).
 */
export interface TransactionSigner {
  getAddress(): string;
  signTransaction(txBytes: Uint8Array): Promise<{ signature: string }>;
}
