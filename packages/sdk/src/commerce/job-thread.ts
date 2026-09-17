// S.1369 — the job delivery thread for a LOCAL key (`t2 job ping` /
// `t2 job watch <jobId>`): signed `POST /v1/job/thread`, read or post.
// Seat-only (the Job's buyer or the seller who claimed): the API answers
// 403 for anyone else, with no body tease. Logistics, not delivery — proof
// of work stays the one-shot `deliver`. Not a Move verb, not send/swap/pay.

import type { TransactionSigner } from '../signer.js';
import { jobThreadChallengeMessage, sha256Hex, signChallenge } from './challenge.js';
import { apiJson, invalidInput } from './http.js';

export type JobThreadMessage = {
  from: string;
  body?: string;
  images?: string[];
  createdAt: string;
};

export type JobThreadResult = {
  jobId: string;
  seat: 'buyer' | 'seller';
  thread: { messages: JobThreadMessage[] };
  /** The seat-only exact where (unit, buzzer, which door) when the buyer
   *  set one — never in the hashed spec. */
  whereExact?: string;
};

/** The canonical payload the signature binds: `action` + `jobId` (+ body /
 *  images on a post), key order fixed here so client and server hash the
 *  same bytes. Pure — tested. */
export function jobThreadPayload(input: {
  action: 'read' | 'post';
  jobId: string;
  body?: string;
  images?: string[];
}): Record<string, unknown> {
  const jobId = input.jobId.trim();
  if (!/^0x[0-9a-fA-F]{40,64}$/.test(jobId)) {
    throw invalidInput('jobId must be the full 0x Job object id.');
  }
  const body = input.body?.trim();
  const images = (input.images ?? []).map((u) => u.trim()).filter(Boolean);
  if (input.action === 'post' && !body && images.length === 0) {
    throw invalidInput('A ping needs a message and/or at least one --image URL.');
  }
  return {
    action: input.action,
    jobId,
    ...(input.action === 'post' && body ? { body } : {}),
    ...(input.action === 'post' && images.length > 0 ? { images } : {}),
  };
}

async function callJobThread(
  apiBase: string,
  signer: TransactionSigner,
  payload: Record<string, unknown>,
): Promise<JobThreadResult> {
  const payloadHash = await sha256Hex(JSON.stringify(payload));
  const { nonce, signature } = await signChallenge(apiBase, signer, (n) =>
    jobThreadChallengeMessage(n, payloadHash),
  );
  const res = await apiJson(`${apiBase}/job/thread`, {
    method: 'POST',
    body: { address: signer.getAddress(), nonce, signature, ...payload },
  });
  return res as unknown as JobThreadResult;
}

/** The thread (+ seat `whereExact`) for this wallet's seat on `jobId`. */
export function readJobThread(
  apiBase: string,
  signer: TransactionSigner,
  jobId: string,
): Promise<JobThreadResult> {
  return callJobThread(apiBase, signer, jobThreadPayload({ action: 'read', jobId }));
}

/** Post text and/or HTTPS photos on the thread; returns the updated thread. */
export function postJobThread(
  apiBase: string,
  signer: TransactionSigner,
  input: { jobId: string; body?: string; images?: string[] },
): Promise<JobThreadResult> {
  return callJobThread(apiBase, signer, jobThreadPayload({ action: 'post', ...input }));
}
