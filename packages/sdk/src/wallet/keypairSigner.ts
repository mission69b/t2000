import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import type { TransactionSigner } from '../signer.js';

export class KeypairSigner implements TransactionSigner {
  constructor(private readonly keypair: Ed25519Keypair) {}

  getAddress(): string {
    return this.keypair.getPublicKey().toSuiAddress();
  }

  async signTransaction(txBytes: Uint8Array): Promise<{ signature: string }> {
    return this.keypair.signTransaction(txBytes);
  }

  /** Access the underlying keypair for APIs that still require it directly. */
  getKeypair(): Ed25519Keypair {
    return this.keypair;
  }
}
