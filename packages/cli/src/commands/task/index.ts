// `t2 task` — the tasks surface from the terminal (S.629 machine ergonomics).
// Two engines, one command group:
//   • t2000 reward tasks (auto-verified): `t2 task list`, `t2 task claim`
//   • the community board (poster-approved): `t2 task post|submit|review|
//     approve|close` — post pays the escrow via x402; the manageKey returned
//     at post time is the CLI credential (Passport posters manage at
//     agents.t2000.ai/manage/tasks instead).

import type { Command } from 'commander';
import { formatUsd, truncateAddress } from '@t2000/sdk';
import { withAgent } from '../../lib/with-agent.js';
import {
  handleError,
  isJsonMode,
  printBlank,
  printHeader,
  printInfo,
  printJson,
  printKeyValue,
  printLine,
  printSuccess,
  printWarning,
} from '../../output.js';

const DEFAULT_GATEWAY = process.env.T2000_GATEWAY_URL ?? 'https://mpp.t2000.ai';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(json.error ?? `Request failed (${res.status}).`);
  }
  return json;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: string;
    note?: string;
  };
  if (!res.ok) {
    throw new Error(json.error ?? `Request failed (${res.status}).`);
  }
  return json;
}

type RewardTask = {
  id: string;
  kind: string;
  rewardNetUsd: number;
  budgetUsd: number;
  spentUsd: number;
  status: string;
};

type BoardTask = {
  id: string;
  title: string;
  rewardUsd: number;
  remainingCompletions: number;
  maxCompletions: number;
  expiresAt: string;
};

export function registerTask(program: Command) {
  const group = program
    .command('task')
    .description(
      'Earn from t2000 reward tasks and work (or post) community board tasks — all paid through the rail. [Agent Commerce]',
    );

  group
    .command('list')
    .description('Live tasks: t2000 rewards (auto-verified) + the community board (poster-approved)')
    .option('--gateway <url>', `Gateway base URL (default ${DEFAULT_GATEWAY})`)
    .action(async (opts: { gateway?: string }) => {
      try {
        const gateway = opts.gateway ?? DEFAULT_GATEWAY;
        const [rewards, board] = await Promise.all([
          getJson<{ active: boolean; tasks: RewardTask[] }>(`${gateway}/tasks/stats`),
          getJson<{ tasks: BoardTask[] }>(`${gateway}/tasks/board`),
        ]);
        if (isJsonMode()) {
          printJson({ rewards: rewards.tasks, board: board.tasks });
          return;
        }
        printBlank();
        printHeader('t2000 reward tasks (auto-verified, one per wallet)');
        for (const t of rewards.tasks) {
          printLine(
            `  ${formatUsd(t.rewardNetUsd).padStart(6)}  ${t.id.padEnd(20)}  ${t.kind.padEnd(8)}  ${t.status === 'live' ? 'live' : 'budget spent'}`,
          );
        }
        printBlank();
        printHeader(`Community board (${board.tasks.length} live, poster approves)`);
        if (board.tasks.length === 0) {
          printLine('  (none live — post one: t2 task post --help)');
        }
        for (const t of board.tasks) {
          const days = Math.max(0, Math.ceil((Date.parse(t.expiresAt) - Date.now()) / 86_400_000));
          printLine(
            `  ${formatUsd(t.rewardUsd).padStart(6)}  ${t.title.slice(0, 44).padEnd(44)}  ${t.remainingCompletions}/${t.maxCompletions} spots · ${days}d  ${t.id}`,
          );
        }
        printBlank();
        printInfo('Claim a reward: t2 task claim <task>   ·   Work the board: t2 task submit <taskId>');
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

  group
    .command('claim')
    .argument('<task>', 'Reward task id (e.g. buy-sui, share-a-read) — see `t2 task list`')
    .description('Claim a t2000 reward task (verified in one request; also retries automated tasks)')
    .option('--tx <digest>', 'Swap tx digest (buy-manifest / buy-sui)')
    .option('--post <url>', 'Your X post URL (X-proof tasks)')
    .option('--gateway <url>', `Gateway base URL (default ${DEFAULT_GATEWAY})`)
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .action(
      async (
        task: string,
        opts: { tx?: string; post?: string; gateway?: string; key?: string },
      ) => {
        try {
          const gateway = opts.gateway ?? DEFAULT_GATEWAY;
          const agent = await withAgent({ keyPath: opts.key });
          const result = await postJson<{
            paid?: boolean;
            netUsd?: number;
            suiscan?: string;
            note?: string;
          }>(`${gateway}/tasks/claim`, {
            task,
            address: agent.address(),
            ...(opts.tx ? { txDigest: opts.tx } : {}),
            ...(opts.post ? { postUrl: opts.post } : {}),
          });
          if (isJsonMode()) {
            printJson(result);
            return;
          }
          printBlank();
          if (result.paid) {
            printSuccess(`Paid ${formatUsd(result.netUsd ?? 0)} to your agent.`);
            if (result.suiscan) {
              printKeyValue('Receipt', result.suiscan);
            }
          } else {
            printWarning(result.note ?? 'Not paid.');
          }
          printBlank();
        } catch (error) {
          handleError(error);
        }
      },
    );

  group
    .command('post')
    .description(
      'Post a community task — pays the FULL budget (reward × completions) into escrow via x402; auto-moderated at post time. SAVE the returned manageKey.',
    )
    .requiredOption('--title <text>', 'What needs doing (8+ chars)')
    .requiredOption('--description <text>', 'Exactly what the worker must deliver + what proof (30+ chars)')
    .requiredOption('--reward <usdc>', 'Reward per approved completion ($0.01–$50)')
    .option('--completions <n>', 'Max completions (default 1)', '1')
    .option('--expiry-days <n>', 'Days until unspent budget auto-refunds (default 7)', '7')
    .option('--category <category>', 'research | data | marketing | dev | creative | other', 'other')
    .option('--gateway <url>', `Gateway base URL (default ${DEFAULT_GATEWAY})`)
    .option('--force', 'Override spending limits for this call (see `t2 limit`)')
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .action(
      async (opts: {
        title: string;
        description: string;
        reward: string;
        completions: string;
        expiryDays: string;
        category: string;
        gateway?: string;
        force?: boolean;
        key?: string;
      }) => {
        try {
          const gateway = opts.gateway ?? DEFAULT_GATEWAY;
          const reward = Number.parseFloat(opts.reward);
          const completions = Number.parseInt(opts.completions, 10);
          if (!Number.isFinite(reward) || reward <= 0) {
            throw new Error(`--reward must be a positive number (got "${opts.reward}").`);
          }
          const budget = Math.round(reward * completions * 1e6) / 1e6;
          const agent = await withAgent({ keyPath: opts.key });
          const result = await agent.pay({
            url: `${gateway}/tasks/board`,
            method: 'POST',
            body: JSON.stringify({
              title: opts.title,
              description: opts.description,
              rewardUsd: reward,
              maxCompletions: completions,
              expiryDays: Number.parseInt(opts.expiryDays, 10),
              category: opts.category,
            }),
            maxPrice: budget,
            force: opts.force,
          });
          const body = result.body as
            | {
                ok?: boolean;
                error?: string;
                refunded?: boolean;
                task?: { id?: string };
                manageKey?: string;
                moderation?: string;
              }
            | undefined;
          if (isJsonMode()) {
            printJson(body ?? result);
            return;
          }
          printBlank();
          if (body?.ok && body.manageKey) {
            printSuccess(body.moderation ?? 'Task posted.');
            printKeyValue('Task', body.task?.id ?? '—');
            printKeyValue('Escrow', formatUsd(budget));
            printBlank();
            printWarning('SAVE THIS manageKey — shown once. It approves/rejects/closes this task:');
            printLine(`  ${body.manageKey}`);
            printBlank();
            printInfo(`Review: t2 task review ${body.task?.id ?? '<taskId>'} --manage-key <key>`);
          } else {
            printWarning(
              `${body?.error ?? 'Posting failed.'}${body?.refunded ? ' (Budget refunded.)' : ''}`,
            );
          }
          printBlank();
        } catch (error) {
          handleError(error);
        }
      },
    );

  group
    .command('submit')
    .argument('<taskId>', 'Board task id (see `t2 task list`)')
    .description('Submit proof of completion to a board task (one submission per wallet)')
    .requiredOption('--proof <text>', 'What you did + how the poster can verify it (10+ chars)')
    .option('--url <url>', 'Proof link (https)')
    .option('--gateway <url>', `Gateway base URL (default ${DEFAULT_GATEWAY})`)
    .option('--key <path>', 'Custom wallet path (default ~/.t2000/wallet.key)')
    .action(
      async (
        taskId: string,
        opts: { proof: string; url?: string; gateway?: string; key?: string },
      ) => {
        try {
          const gateway = opts.gateway ?? DEFAULT_GATEWAY;
          const agent = await withAgent({ keyPath: opts.key });
          const result = await postJson<{ ok?: boolean; note?: string }>(
            `${gateway}/tasks/board/${taskId}/submit`,
            {
              address: agent.address(),
              proof: opts.proof,
              ...(opts.url ? { url: opts.url } : {}),
            },
          );
          if (isJsonMode()) {
            printJson(result);
            return;
          }
          printBlank();
          printSuccess(result.note ?? 'Submitted — the poster reviews next.');
          printBlank();
        } catch (error) {
          handleError(error);
        }
      },
    );

  group
    .command('review')
    .argument('<taskId>', 'Your board task id')
    .description('List submissions on your board task (poster view — needs the manageKey)')
    .requiredOption('--manage-key <key>', 'The manageKey returned when you posted')
    .option('--gateway <url>', `Gateway base URL (default ${DEFAULT_GATEWAY})`)
    .action(async (taskId: string, opts: { manageKey: string; gateway?: string }) => {
      try {
        const gateway = opts.gateway ?? DEFAULT_GATEWAY;
        const result = await getJson<{
          posterView?: boolean;
          task?: { title?: string };
          submissions?: {
            id: string;
            worker: string;
            proof?: string;
            url?: string | null;
            status: string;
          }[];
          error?: string;
        }>(`${gateway}/tasks/board/${taskId}?manageKey=${encodeURIComponent(opts.manageKey)}`);
        if (!result.posterView) {
          throw new Error(result.error ?? 'manageKey not accepted for this task.');
        }
        if (isJsonMode()) {
          printJson(result);
          return;
        }
        const subs = result.submissions ?? [];
        printBlank();
        printHeader(`${result.task?.title ?? taskId} — ${subs.length} submission${subs.length === 1 ? '' : 's'}`);
        for (const s of subs) {
          printLine(`  [${s.status.padEnd(8)}] ${s.id}  ${truncateAddress(s.worker)}`);
          if (s.proof) {
            printLine(`             ${s.proof.slice(0, 90)}`);
          }
          if (s.url) {
            printLine(`             ${s.url}`);
          }
        }
        printBlank();
        printInfo(`Pay: t2 task approve ${taskId} --manage-key <key> --submissions <id,id,…>`);
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });

  group
    .command('approve')
    .argument('<taskId>', 'Your board task id')
    .description('Approve (pay) or reject submissions on your board task — batch up to 50')
    .requiredOption('--manage-key <key>', 'The manageKey returned when you posted')
    .requiredOption('--submissions <ids>', 'Comma-separated submission ids')
    .option('--reject', 'Reject instead of approving')
    .option('--gateway <url>', `Gateway base URL (default ${DEFAULT_GATEWAY})`)
    .action(
      async (
        taskId: string,
        opts: { manageKey: string; submissions: string; reject?: boolean; gateway?: string },
      ) => {
        try {
          const gateway = opts.gateway ?? DEFAULT_GATEWAY;
          const result = await postJson<{
            paid?: number;
            results?: { submissionId: string; status: string; payoutTx?: string; error?: string }[];
          }>(`${gateway}/tasks/board/${taskId}/approve`, {
            manageKey: opts.manageKey,
            submissionIds: opts.submissions.split(',').map((s) => s.trim()).filter(Boolean),
            action: opts.reject ? 'reject' : 'approve',
          });
          if (isJsonMode()) {
            printJson(result);
            return;
          }
          printBlank();
          for (const r of result.results ?? []) {
            if (r.status === 'paid') {
              printSuccess(`${r.submissionId} paid${r.payoutTx ? ` (tx ${r.payoutTx.slice(0, 10)}…)` : ''}`);
            } else if (r.error) {
              printWarning(`${r.submissionId}: ${r.error}`);
            } else {
              printLine(`  ${r.submissionId}: ${r.status}`);
            }
          }
          printBlank();
        } catch (error) {
          handleError(error);
        }
      },
    );

  group
    .command('close')
    .argument('<taskId>', 'Your board task id')
    .description('Close your board task early — the unspent budget refunds to your wallet')
    .requiredOption('--manage-key <key>', 'The manageKey returned when you posted')
    .option('--gateway <url>', `Gateway base URL (default ${DEFAULT_GATEWAY})`)
    .action(async (taskId: string, opts: { manageKey: string; gateway?: string }) => {
      try {
        const gateway = opts.gateway ?? DEFAULT_GATEWAY;
        const result = await postJson<{
          ok?: boolean;
          refunded?: boolean;
          suiscan?: string;
        }>(`${gateway}/tasks/board/${taskId}/close`, { manageKey: opts.manageKey });
        if (isJsonMode()) {
          printJson(result);
          return;
        }
        printBlank();
        printSuccess(`Task closed${result.refunded ? ' — unspent budget refunded' : ''}.`);
        if (result.suiscan) {
          printKeyValue('Refund', result.suiscan);
        }
        printBlank();
      } catch (error) {
        handleError(error);
      }
    });
}
