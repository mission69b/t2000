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

  async signPersonalMessage(_messageBytes: Uint8Array): Promise<{ signature: string; bytes: string }> {
    // zkLogin personal-message signing for `@suimpp/mpp` 0.7+ grief protection
    // is not yet wired here. Audric (the only zkLogin consumer today) uses the
    // sponsored-tx flow which does not call `sdk.pay()`. Implement when audric
    // needs to drive MPP payments directly from the SDK.
    throw new Error('ZkLoginSigner.signPersonalMessage is not yet implemented. Use KeypairSigner for sdk.pay() until grief-protection signing is wired for zkLogin.');
  }

  isExpired(currentEpoch: number): boolean {
    return currentEpoch >= this.maxEpoch;
  }
}
