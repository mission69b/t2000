import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { env } from '@/lib/env';
import {
  getTask,
  isTasksConfigured,
  settleTaskIfQualified,
  settleXProofTask,
  TASKS_LAUNCH_AT,
} from '@/lib/tasks';
import { fetchXPost, parseXPostUrl, X_MENTION } from '@/lib/x-proof';

// POST /tasks/claim — the claim trigger for tasks whose qualifying event
// happens OUTSIDE our ledger, and the RETRY path for ledger tasks (re-runs
// the qualification — e.g. a reward buy that failed because the worker's
// endpoint was down):
//   - buy-manifest / buy-sui: swaps on Sui — digest verified on-chain here.
//   - verify-confidential: an X post — read keylessly from X's public
//     syndication CDN, and the posted receipt id re-verified trustlessly
//     via the SDK (signed receipt + Sui anchor). No weekly review.
// Payment goes through the standard rail buy (lib/tasks.ts). Nothing here
// trusts the caller: every proof is fetched fresh and checked structurally.
export const dynamic = 'force-dynamic';

// Swap-shaped verification thresholds (token units — deterministic, no
// price oracle): the claimant must have GAINED at least this much of the
// target coin in a tx where they also PAID something (a negative leg in
// another asset) — a self-transfer has no negative leg and doesn't qualify.
const MANIFEST_TYPE =
  '0xc466c28d87b3d5cd34f3d5c088751532d71a38d93a8aae4551dd56272cfb4355::manifest::MANIFEST';
const SUI_TYPE = '0x2::sui::SUI';
const CLAIM_RULES: Record<
  string,
  { coinType: string; minRaw: bigint; label: string }
> = {
  'buy-manifest': {
    coinType: MANIFEST_TYPE,
    minRaw: BigInt('10000000000'), // ≥ 10 MANIFEST (9 decimals)
    label: '10 MANIFEST',
  },
  'buy-sui': {
    coinType: SUI_TYPE,
    minRaw: BigInt('500000000'), // ≥ 0.5 SUI (9 decimals)
    label: '0.5 SUI',
  },
};

type BalanceChange = {
  owner?: { AddressOwner?: string } | string;
  coinType?: string;
  amount?: string;
};

async function fetchTx(digest: string): Promise<{
  timestampMs: number | null;
  balanceChanges: BalanceChange[];
} | null> {
  const rpcUrl =
    env.SUI_NETWORK === 'testnet'
      ? 'https://fullnode.testnet.sui.io'
      : 'https://fullnode.mainnet.sui.io';
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'sui_getTransactionBlock',
      params: [digest, { showBalanceChanges: true }],
    }),
  });
  if (!res.ok) {
    return null;
  }
  const json = (await res.json()) as {
    result?: { timestampMs?: string; balanceChanges?: BalanceChange[] };
  };
  if (!json.result) {
    return null;
  }
  return {
    timestampMs: json.result.timestampMs
      ? Number.parseInt(json.result.timestampMs, 10)
      : null,
    balanceChanges: json.result.balanceChanges ?? [],
  };
}

function ownerAddress(change: BalanceChange): string | null {
  if (typeof change.owner === 'object' && change.owner?.AddressOwner) {
    return change.owner.AddressOwner.toLowerCase();
  }
  return null;
}

export async function POST(req: Request): Promise<Response> {
  if (!isTasksConfigured()) {
    return Response.json(
      { error: 'Tasks are not active right now.' },
      { status: 503 },
    );
  }

  let body: {
    task?: string;
    address?: string;
    txDigest?: string;
    postUrl?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const task = getTask(body.task ?? '');
  if (!task) {
    return Response.json(
      {
        error: `Unknown task. Valid: first-sale, agent-hire, agent-card, buy-manifest, buy-sui, verify-confidential, share-your-agent, share-a-read.`,
      },
      { status: 400 },
    );
  }

  let address: string;
  try {
    address = normalizeSuiAddress((body.address ?? '').trim());
  } catch {
    address = '';
  }
  if (!isValidSuiAddress(address)) {
    return Response.json(
      { error: 'A valid Sui `address` is required (your agent wallet — where the reward goes).' },
      { status: 400 },
    );
  }

  // Claim-kind tasks verify the submitted swap tx on-chain first; ledger
  // tasks just re-run their receipt qualification (the retry path).
  if (task.kind === 'claim') {
    const rule = CLAIM_RULES[task.id];
    const digest = (body.txDigest ?? '').trim();
    if (!digest) {
      return Response.json(
        { error: `Pass \`txDigest\` — the Sui tx where you acquired ≥ ${rule.label}.` },
        { status: 400 },
      );
    }
    const tx = await fetchTx(digest);
    if (!tx) {
      return Response.json(
        { error: 'That transaction was not found on Sui mainnet.' },
        { status: 400 },
      );
    }
    if (tx.timestampMs !== null && tx.timestampMs < TASKS_LAUNCH_AT.getTime()) {
      return Response.json(
        { error: 'Only transactions after the tasks launch qualify.' },
        { status: 400 },
      );
    }
    const gained = tx.balanceChanges.find(
      (c) =>
        ownerAddress(c) === address.toLowerCase() &&
        c.coinType === rule.coinType &&
        BigInt(c.amount ?? '0') >= rule.minRaw,
    );
    // Swap-shaped: the claimant must also have PAID something in the same tx
    // (any negative leg in a DIFFERENT asset) — a bare transfer-in doesn't
    // qualify, so shuffling tokens between your own wallets earns nothing.
    const paidLeg = tx.balanceChanges.find(
      (c) =>
        ownerAddress(c) === address.toLowerCase() &&
        c.coinType !== rule.coinType &&
        BigInt(c.amount ?? '0') < BigInt(0),
    );
    if (!(gained && paidLeg)) {
      return Response.json(
        {
          error: `That tx doesn't show ${address.slice(0, 10)}… acquiring ≥ ${rule.label} in a swap (bought with another asset).`,
        },
        { status: 400 },
      );
    }
  }

  // X-proof tasks: read the post keylessly, then verify the task-specific
  // proof it must carry. Common to all: public, post-launch, mentions us,
  // and contains the claiming wallet (binds the post to the claimant —
  // nobody can claim someone else's post). Per-task:
  //   verify-confidential → an rcpt-… id that verifies trustlessly (signed
  //     receipt + Sui anchor via the SDK);
  //   share-your-agent → the claimant's own listing URL (which carries the
  //     full address = the binding) AND a registered agent in the directory.
  if (task.kind === 'x-proof') {
    const postId = parseXPostUrl(body.postUrl ?? '');
    if (!postId) {
      return Response.json(
        { error: 'Pass `postUrl` — the full https://x.com/…/status/… link to your post.' },
        { status: 400 },
      );
    }
    const post = await fetchXPost(postId);
    if (!post) {
      return Response.json(
        { error: 'Could not read that post — it must be public (not deleted, not a protected account).' },
        { status: 400 },
      );
    }
    if (post.createdAt && post.createdAt.getTime() < TASKS_LAUNCH_AT.getTime()) {
      return Response.json(
        { error: 'Only posts after the tasks launch qualify.' },
        { status: 400 },
      );
    }
    const text = post.text.toLowerCase();
    if (!text.includes(X_MENTION.toLowerCase())) {
      return Response.json(
        { error: `The post must mention ${X_MENTION}.` },
        { status: 400 },
      );
    }
    if (!text.includes(address.slice(0, 18).toLowerCase())) {
      return Response.json(
        {
          error:
            'The post must include the claiming wallet address — that binds the post to your claim.',
        },
        { status: 400 },
      );
    }

    // The dedupe token beyond wallet + X handle: the receipt id for
    // verify-confidential (public ids can't be re-claimed), the post id for
    // share-your-agent (one reward per post).
    let proofToken: string;

    if (task.id === 'verify-confidential') {
      const receiptId = post.text.match(/rcpt-[a-f0-9]{16,64}/i)?.[0]?.toLowerCase();
      if (!receiptId) {
        return Response.json(
          { error: 'The post must include your confidential receipt id (rcpt-…).' },
          { status: 400 },
        );
      }
      const { verifyReceipt } = await import('@t2000/sdk');
      let verified = false;
      try {
        verified = (await verifyReceipt(receiptId, { skipQuote: true })).verified;
      } catch {
        verified = false;
      }
      if (!verified) {
        return Response.json(
          {
            error: `${receiptId} did not verify (signed receipt + Sui anchor). Run \`t2 verify ${receiptId}\` to see why.`,
          },
          { status: 400 },
        );
      }
      proofToken = receiptId;
    } else if (task.id === 'share-your-agent') {
      if (!text.includes(`agents.t2000.ai/${address.toLowerCase()}`)) {
        return Response.json(
          {
            error:
              'The post must include YOUR listing URL: agents.t2000.ai/<your full wallet address>.',
          },
          { status: 400 },
        );
      }
      let registered = false;
      try {
        const res = await fetch(`https://api.t2000.ai/v1/agents/${address}`, {
          headers: { accept: 'application/json' },
        });
        registered = res.ok;
      } catch {
        registered = false;
      }
      if (!registered) {
        return Response.json(
          {
            error:
              'That wallet has no registered agent — run `t2 init` (free, gasless) and share your real listing.',
          },
          { status: 400 },
        );
      }
      proofToken = `post:${post.id}`;
    } else {
      // share-a-read (S.626.1): the post names a shelf listing; the LEDGER
      // proves the claimant actually bought from that seller (settled +
      // delivered, post-launch). Ledger + x-proof hybrid.
      const seller = post.text.match(/agents\.t2000\.ai\/(0x[a-f0-9]{64})/i)?.[1]?.toLowerCase();
      if (!seller) {
        return Response.json(
          {
            error:
              "The post must include the listing URL of the read you bought: agents.t2000.ai/<the seller's full address>.",
          },
          { status: 400 },
        );
      }
      const { prisma } = await import('@/lib/prisma');
      const bought = await prisma.commerceReceipt.findFirst({
        where: {
          buyer: address,
          seller,
          status: 'settled',
          resource: { not: null },
          createdAt: { gte: TASKS_LAUNCH_AT },
        },
        select: { id: true },
      });
      if (!bought) {
        return Response.json(
          {
            error:
              'No settled purchase from that seller by the claiming wallet — buy the read first (t2 agent pay), then post about it.',
          },
          { status: 400 },
        );
      }
      proofToken = `post:${post.id}`;
    }

    const result = await settleXProofTask(task, address, post.handle, proofToken);
    if ('reason' in result) {
      return Response.json({ paid: false, note: result.reason }, { status: 200 });
    }
    return Response.json({
      paid: true,
      task: task.id,
      netUsd: result.netUsd,
      receipt: result.digest,
      suiscan: `https://suiscan.xyz/mainnet/tx/${result.digest}`,
    });
  }

  const record = await settleTaskIfQualified(task, address);
  if (!record) {
    return Response.json(
      {
        paid: false,
        note: 'Not paid: either not qualified yet, already paid for this task, the budget is spent, or the reward payment failed (retry later).',
      },
      { status: 200 },
    );
  }
  return Response.json({
    paid: true,
    task: task.id,
    netUsd: record.netUsd,
    receipt: record.digest,
    suiscan: `https://suiscan.xyz/mainnet/tx/${record.digest}`,
  });
}
