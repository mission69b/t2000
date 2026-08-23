// CommerceClient — the ONE write SSOT for seller onboarding (S.1158,
// SPEC_HEADLESS_SELL_STACK §3): register → profile → service / package →
// optional x402 listing, programmatically, with any `TransactionSigner`.
// `t2 agent *` and `t2 service *` are thin wrappers over this class.
//
// Every verb is gasless: registry writes ride the sponsored rail; profile
// and service writes are signed challenges. Errors are `T2000Error` with
// the API's own message. Custom `apiBase` hosts: the SDK ships no host pin
// — install one with `setSponsoredTxGuard` (the CLI does) before signing
// against anything but api.t2000.ai.

import type { TransactionSigner } from '../signer.js';
import { listEndpoint, removeEndpoint } from './endpoint.js';
import { DEFAULT_COMMERCE_API_BASE } from './http.js';
import { createPackage } from './package.js';
import { ensureCategory, updateProfile } from './profile.js';
import { registerAgent } from './register.js';
import { getAgentProfile, resolveAgentRef } from './resolve.js';
import { retireService, upsertService } from './service.js';
import type {
  AgentProfile,
  AgentRef,
  CommerceClientOptions,
  CreatePackageInput,
  CreatePackageResult,
  EndpointListing,
  ProfileUpdateInput,
  RegisterResult,
  ServiceUpsertInput,
  ServiceWriteResult,
} from './types.js';

export class CommerceClient {
  readonly signer: TransactionSigner;
  readonly apiBase: string;

  constructor(options: CommerceClientOptions) {
    this.signer = options.signer;
    this.apiBase = (options.apiBase ?? DEFAULT_COMMERCE_API_BASE).replace(/\/+$/, '');
  }

  /** This signer's wallet address. */
  get address(): string {
    return this.signer.getAddress();
  }

  /** Register the wallet as an on-chain Agent ID (sponsored; idempotent). */
  register(): Promise<RegisterResult> {
    return registerAgent(this.apiBase, this.signer);
  }

  /** Set public profile fields (signed, no gas). */
  updateProfile(input: ProfileUpdateInput): Promise<{ address: string }> {
    return updateProfile(this.apiBase, this.signer, input);
  }

  /** The sell gate — set `category` or confirm the live one; throws when
   *  neither exists. Returns the category in force. */
  ensureCategory(category?: string): Promise<string> {
    return ensureCategory(this.apiBase, this.signer, category);
  }

  /** This seller's public profile (null when unregistered). */
  profile(): Promise<AgentProfile | null> {
    return getAgentProfile(this.address, this.apiBase);
  }

  /** List (or fully re-write) one service — `mode: "create"` refuses a live slug. */
  upsertService(input: ServiceUpsertInput): Promise<ServiceWriteResult> {
    return upsertService(this.apiBase, this.signer, input);
  }

  /** Take a service off the board (funded jobs keep settling on-chain). */
  retireService(input: { slug: string } | string): Promise<ServiceWriteResult> {
    return retireService(
      this.apiBase,
      this.signer,
      typeof input === 'string' ? input : input.slug,
    );
  }

  /** Three tiers under one name — `{base}-basic|standard|premium`. */
  createPackage(input: CreatePackageInput): Promise<CreatePackageResult> {
    return createPackage(this.apiBase, this.signer, input);
  }

  /** Sell an x402 API (origin or one 402 URL) — live-probed, sponsored. */
  listEndpoint(endpoint: string, opts: { primary?: string } = {}): Promise<EndpointListing> {
    return listEndpoint(this.apiBase, this.signer, endpoint, opts);
  }

  /** Clear the x402 listing. */
  removeEndpoint(): Promise<EndpointListing> {
    return removeEndpoint(this.apiBase, this.signer);
  }

  /** `#93` · `@handle` · `name.sui` · `0x…` → wallet (marketplace refs only). */
  resolveRef(q: string): Promise<AgentRef> {
    return resolveAgentRef(q, this.apiBase);
  }
}
