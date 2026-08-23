// Services (t2 ACP) — the seller catalog: signed FULL upsert + retire via
// `POST /v1/agent/service` { address, nonce, signature, action, payload }.
// The signature binds sha256(JSON.stringify(payload)) so the payload the
// server stores is the payload the seller signed.

import type { TransactionSigner } from '../signer.js';
import {
  serviceChallengeMessage,
  servicePayloadSha256,
  signChallenge,
} from './challenge.js';
import { apiJson, invalidInput } from './http.js';
import { SERVICE_SLUG_RE } from './package-slug.js';
import type { ServiceUpsertInput, ServiceWriteResult } from './types.js';

/** The wire payload for an upsert — key order is the signed bytes, so it
 *  is fixed here and nowhere else. */
export function serviceUpsertPayload(
  input: ServiceUpsertInput,
): Record<string, unknown> {
  const slug = input.slug.trim().toLowerCase();
  if (!SERVICE_SLUG_RE.test(slug)) {
    throw invalidInput(
      'slug must be 2-48 chars of [a-z0-9-], starting alphanumeric.',
    );
  }
  return {
    ...(input.mode ? { mode: input.mode } : {}),
    slug,
    name: input.name.trim(),
    description: input.description.trim(),
    priceUsdc: input.priceUsdc,
    slaMinutes: input.slaMinutes,
    reviewWindowMinutes: input.reviewWindowMinutes ?? 1440,
    rejectSplitBps: input.rejectSplitBps ?? 8000,
    requirements: input.requirements,
    deliverable: input.deliverable.trim(),
    ...(input.examples === undefined ? {} : { examples: input.examples }),
  };
}

async function signedServiceAction(
  apiBase: string,
  signer: TransactionSigner,
  action: 'upsert' | 'retire',
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const address = signer.getAddress();
  const { nonce, signature } = await signChallenge(
    apiBase,
    signer,
    async (n) => serviceChallengeMessage(n, await servicePayloadSha256(payload)),
  );
  return apiJson(`${apiBase}/agent/service`, {
    method: 'POST',
    body: { address, nonce, signature, action, payload },
  });
}

export async function upsertService(
  apiBase: string,
  signer: TransactionSigner,
  input: ServiceUpsertInput,
): Promise<ServiceWriteResult> {
  const payload = serviceUpsertPayload(input);
  const response = await signedServiceAction(apiBase, signer, 'upsert', payload);
  return { address: signer.getAddress(), slug: payload.slug as string, response };
}

export async function retireService(
  apiBase: string,
  signer: TransactionSigner,
  slug: string,
): Promise<ServiceWriteResult> {
  const clean = slug.trim().toLowerCase();
  if (!SERVICE_SLUG_RE.test(clean)) {
    throw invalidInput('slug must be 2-48 chars of [a-z0-9-], starting alphanumeric.');
  }
  const response = await signedServiceAction(apiBase, signer, 'retire', {
    slug: clean,
  });
  return { address: signer.getAddress(), slug: clean, response };
}
