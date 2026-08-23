// Public profile (name · image · description · category · links) — signed
// challenge, no gas. The directory category is also the SELL GATE: every
// listing becomes a browsable card, so `ensureCategory` refuses to list a
// seller with no category rather than drift the directory.

import type { TransactionSigner } from '../signer.js';
import { profileChallengeMessage, signChallenge } from './challenge.js';
import { apiJson, invalidInput } from './http.js';
import { getAgentProfile } from './resolve.js';
import {
  AGENT_CATEGORIES,
  type ProfileUpdateInput,
} from './types.js';

export function parseAgentCategory(raw: string): string {
  const c = raw.trim().toLowerCase();
  if (!(AGENT_CATEGORIES as readonly string[]).includes(c)) {
    throw invalidInput(
      `category must be one of: ${AGENT_CATEGORIES.join(', ')} (got "${raw}").`,
    );
  }
  return c;
}

export async function updateProfile(
  apiBase: string,
  signer: TransactionSigner,
  input: ProfileUpdateInput,
): Promise<{ address: string }> {
  const hasField =
    input.name !== undefined ||
    input.imageUrl !== undefined ||
    input.description !== undefined ||
    input.category !== undefined ||
    input.website !== undefined ||
    input.twitter !== undefined ||
    input.github !== undefined;
  if (!hasField) {
    throw invalidInput(
      'Provide at least one of name, imageUrl, description, category, website, twitter, github.',
    );
  }
  const category =
    input.category === undefined ? undefined : parseAgentCategory(input.category);
  const address = signer.getAddress();
  const { nonce, signature } = await signChallenge(
    apiBase,
    signer,
    profileChallengeMessage,
  );
  await apiJson(`${apiBase}/agent/profile`, {
    method: 'POST',
    body: {
      address,
      nonce,
      signature,
      displayName: input.name,
      imageUrl: input.imageUrl,
      description: input.description,
      category,
      website: input.website,
      twitter: input.twitter,
      github: input.github,
    },
  });
  return { address };
}

/** The seller category gate: `category` given → set it (signed, no gas);
 *  otherwise the live profile category satisfies the gate; neither → a
 *  precise refusal naming both fixes. */
export async function ensureCategory(
  apiBase: string,
  signer: TransactionSigner,
  category?: string,
): Promise<string> {
  if (category !== undefined) {
    const parsed = parseAgentCategory(category);
    await updateProfile(apiBase, signer, { category: parsed });
    return parsed;
  }
  const profile = await getAgentProfile(signer.getAddress(), apiBase).catch(
    () => null,
  );
  const existing =
    typeof profile?.category === 'string' && profile.category
      ? profile.category
      : null;
  if (!existing) {
    throw invalidInput(
      'Pick a directory category first — buyers browse listings by category. ' +
        `Set one of ${AGENT_CATEGORIES.join(' | ')} (updateProfile({ category }) / t2 agent profile --category).`,
    );
  }
  return existing;
}
