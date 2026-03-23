import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import type { TransactionSigner } from '../signer.js';

export interface ZkLoginProof {
  proofPoints: {
    a: string[];
    b: string[][];
    c: string[];
  };
  issBase64Details: {
    indexMod4: number;
    value: string;
  };
  headerBase64: string;
  addressSeed: string;
}

export class ZkLoginSigner implements TransactionSigner {
  constructor(
    private readonly ephemeralKeypair: Ed25519Keypair,
    private readonly zkProof: ZkLoginProof,
    private readonly userAddress: string,
    private readonly maxEpoch: number,
  ) {}

  getAddress(): string {
    return this.userAddress;
  }

  async signTransaction(txBytes: Uint8Array): Promise<{ signature: string }> {
    const { getZkLoginSignature } = await import('@mysten/zklogin');
    const ephSig = await this.ephemeralKeypair.signTransaction(txBytes);
    return {
      signature: getZkLoginSignature({
        inputs: this.zkProof,
        maxEpoch: this.maxEpoch,
        userSignature: ephSig.signature,
      }),
    };
  }

  isExpired(currentEpoch: number): boolean {
    return currentEpoch >= this.maxEpoch;
  }
}
