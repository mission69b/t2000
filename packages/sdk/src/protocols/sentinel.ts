import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { SENTINEL, CLOCK_ID, MIST_PER_SUI } from '../constants.js';
import { T2000Error } from '../errors.js';
import type { TransactionSigner } from '../signer.js';
import type { SentinelAgent, SentinelVerdict, SentinelAttackResult } from '../types.js';
import type { ProtocolDescriptor } from '../adapters/types.js';

export const descriptor: ProtocolDescriptor = {
  id: 'sentinel',
  name: 'Sui Sentinel',
  packages: [SENTINEL.PACKAGE],
  actionMap: {
    'sentinel::request_attack': 'sentinel_attack',
    'sentinel::consume_prompt': 'sentinel_settle',
  },
};

interface RawSentinelAgent {
  agent_id: string;
  agent_object_id: string;
  agent_name: string;
  cost_per_message: string;
  total_balance: string;
  total_attacks: number;
  successful_breaches?: number;
  state: string;
  prompt: string;
  model?: string;
}

function mapAgent(raw: RawSentinelAgent): SentinelAgent {
  return {
    id: raw.agent_id,
    objectId: raw.agent_object_id,
    name: raw.agent_name,
    model: raw.model ?? 'unknown',
    systemPrompt: raw.prompt,
    attackFee: BigInt(raw.cost_per_message),
    prizePool: BigInt(raw.total_balance),
    totalAttacks: raw.total_attacks,
    successfulBreaches: raw.successful_breaches ?? 0,
    state: raw.state,
  };
}

export async function listSentinels(): Promise<SentinelAgent[]> {
  const res = await fetch(SENTINEL.SENTINELS_API);
  if (!res.ok) {
    throw new T2000Error('SENTINEL_API_ERROR', `Sentinel API returned ${res.status}`);
  }

  const data = (await res.json()) as { agents: RawSentinelAgent[] };
  if (!Array.isArray(data.agents)) {
    throw new T2000Error('SENTINEL_API_ERROR', 'Unexpected API response shape');
  }

  return data.agents
    .filter((a) => a.state === 'active')
    .map(mapAgent);
}

export async function getSentinelInfo(
  client: SuiJsonRpcClient,
  sentinelObjectId: string,
): Promise<SentinelAgent> {
  const agents = await listSentinels();
  const match = agents.find((a) => a.objectId === sentinelObjectId || a.id === sentinelObjectId);

  if (match) return match;

  const obj = await client.getObject({
    id: sentinelObjectId,
    options: { showContent: true, showType: true },
  });

  if (!obj.data) {
    throw new T2000Error('SENTINEL_NOT_FOUND', `Sentinel ${sentinelObjectId} not found on-chain`);
  }

  const content = obj.data.content;
  if (!content || content.dataType !== 'moveObject') {
    throw new T2000Error('SENTINEL_NOT_FOUND', `Object ${sentinelObjectId} is not a Move object`);
  }

  const fields = content.fields as Record<string, unknown>;

  return {
    id: (fields.id as { id: string })?.id ?? sentinelObjectId,
    objectId: sentinelObjectId,
    name: (fields.name as string) ?? 'Unknown',
    model: (fields.model as string) ?? 'unknown',
    systemPrompt: (fields.system_prompt as string) ?? '',
    attackFee: BigInt((fields.cost_per_message as string) ?? '0'),
    prizePool: BigInt((fields.balance as string) ?? '0'),
    totalAttacks: Number((fields.total_attacks as string) ?? '0'),
    successfulBreaches: Number((fields.successful_breaches as string) ?? '0'),
    state: (fields.state as string) ?? 'unknown',
  };
}

export async function requestAttack(
  client: SuiJsonRpcClient,
  signer: TransactionSigner,
  sentinelObjectId: string,
  feeMist: bigint,
): Promise<{ attackObjectId: string; digest: string }> {
  if (feeMist < SENTINEL.MIN_FEE_MIST) {
    throw new T2000Error('INVALID_AMOUNT', `Attack fee must be at least 0.1 SUI (${SENTINEL.MIN_FEE_MIST} MIST)`);
  }

  const address = signer.getAddress();
  const tx = new Transaction();
  tx.setSender(address);
  const [coin] = tx.splitCoins(tx.gas, [Number(feeMist)]);

  const [attack] = tx.moveCall({
    target: `${SENTINEL.PACKAGE}::sentinel::request_attack`,
    arguments: [
      tx.object(SENTINEL.AGENT_REGISTRY),
      tx.object(sentinelObjectId),
      tx.object(SENTINEL.PROTOCOL_CONFIG),
      coin,
      tx.object(SENTINEL.RANDOM),
      tx.object(CLOCK_ID),
    ],
  });

  tx.transferObjects([attack], address);

  const built = await tx.build({ client });
  const { signature } = await signer.signTransaction(built);
  const result = await client.executeTransactionBlock({
    transactionBlock: built,
    signature,
    options: { showObjectChanges: true, showEffects: true },
  });

  await client.waitForTransaction({ digest: result.digest });

  const attackObj = result.objectChanges?.find(
    (c: Record<string, unknown>) => c.type === 'created' && (c.objectType as string)?.includes('::sentinel::Attack'),
  );

  const attackObjectId = attackObj && 'objectId' in attackObj ? (attackObj as Record<string, string>).objectId : undefined;

  if (!attackObjectId) {
    throw new T2000Error('SENTINEL_TX_FAILED', 'Attack object was not created — transaction may have failed');
  }

  return { attackObjectId, digest: result.digest };
}

export async function submitPrompt(
  agentId: string,
  attackObjectId: string,
  prompt: string,
): Promise<SentinelVerdict> {
  const res = await fetch(SENTINEL.TEE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent_id: agentId,
      attack_object_id: attackObjectId,
      message: prompt,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new T2000Error('SENTINEL_TEE_ERROR', `TEE returned ${res.status}: ${body.slice(0, 200)}`);
  }

  const raw = await res.json() as Record<string, unknown>;

  // TEE wraps: { response: { intent, timestamp_ms, data: { ... } }, signature }
  const envelope = (raw.response ?? raw) as Record<string, unknown>;
  const data = (envelope.data ?? envelope) as Record<string, unknown>;
  const signature = (raw.signature ?? data.signature) as string;
  const timestampMs = (envelope.timestamp_ms ?? data.timestamp_ms) as number;

  if (typeof signature !== 'string') {
    throw new T2000Error('SENTINEL_TEE_ERROR', 'TEE response missing signature');
  }

  return {
    success: (data.success ?? data.is_success) as boolean,
    score: data.score as number,
    agentResponse: data.agent_response as string,
    juryResponse: data.jury_response as string,
    funResponse: (data.fun_response as string) ?? '',
    signature,
    timestampMs,
  };
}

export async function settleAttack(
  client: SuiJsonRpcClient,
  signer: TransactionSigner,
  sentinelObjectId: string,
  attackObjectId: string,
  prompt: string,
  verdict: SentinelVerdict,
): Promise<{ digest: string; success: boolean }> {
  const sigBytes = Array.from(Buffer.from(verdict.signature.replace(/^0x/, ''), 'hex'));

  const address = signer.getAddress();
  const tx = new Transaction();
  tx.setSender(address);
  tx.moveCall({
    target: `${SENTINEL.PACKAGE}::sentinel::consume_prompt`,
    arguments: [
      tx.object(SENTINEL.AGENT_REGISTRY),
      tx.object(SENTINEL.PROTOCOL_CONFIG),
      tx.object(sentinelObjectId),
      tx.pure.bool(verdict.success),
      tx.pure.string(verdict.agentResponse),
      tx.pure.string(verdict.juryResponse),
      tx.pure.string(verdict.funResponse),
      tx.pure.string(prompt),
      tx.pure.u8(verdict.score),
      tx.pure.u64(verdict.timestampMs),
      tx.pure(bcs.vector(bcs.u8()).serialize(sigBytes)),
      tx.object(SENTINEL.ENCLAVE),
      tx.object(attackObjectId),
      tx.object(CLOCK_ID),
    ],
  });

  const built = await tx.build({ client });
  const { signature } = await signer.signTransaction(built);
  const result = await client.executeTransactionBlock({
    transactionBlock: built,
    signature,
    options: { showEffects: true },
  });

  await client.waitForTransaction({ digest: result.digest });

  const txSuccess = (result.effects as { status?: { status?: string } })?.status?.status === 'success';

  return { digest: result.digest, success: txSuccess };
}

export async function attack(
  client: SuiJsonRpcClient,
  signer: TransactionSigner,
  sentinelId: string,
  prompt: string,
  feeMist?: bigint,
): Promise<SentinelAttackResult> {
  const sentinel = await getSentinelInfo(client, sentinelId);
  const fee = feeMist ?? sentinel.attackFee;

  if (fee < SENTINEL.MIN_FEE_MIST) {
    throw new T2000Error('INVALID_AMOUNT', `Attack fee must be at least 0.1 SUI`);
  }

  const { attackObjectId, digest: requestTx } = await requestAttack(
    client,
    signer,
    sentinel.objectId,
    fee,
  );

  const verdict = await submitPrompt(sentinel.id, attackObjectId, prompt);

  const { digest: settleTx } = await settleAttack(
    client,
    signer,
    sentinel.objectId,
    attackObjectId,
    prompt,
    verdict,
  );

  const won = verdict.success && verdict.score >= 70;

  return {
    attackObjectId,
    sentinelId: sentinel.id,
    prompt,
    verdict,
    requestTx,
    settleTx,
    won,
    feePaid: Number(fee) / Number(MIST_PER_SUI),
  };
}
