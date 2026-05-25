// ---------------------------------------------------------------------------
// prompts.ts — 14 workflow-shaped MCP prompts that compose baked skills
// ---------------------------------------------------------------------------
//
// SPEC v0.7a Phase 6G (companion to 6C). Each workflow prompt is a thin
// shell:
//
//   1. ROLE — one sentence, what the assistant is doing.
//   2. SKILL COMPOSITION — `composeSkillBody` / `composeSkillSections` pulls
//      the canonical tool-orchestration prose from `t2000-skills/skills/`,
//      so when a skill updates its tool sequence (e.g. `t2000-borrow` adds
//      a pre-borrow safety guard), every workflow prompt that uses that
//      skill picks up the change automatically — no duplicated prose to
//      keep in sync.
//   3. FRAMING — workflow-specific presentation rules (Bloomberg brief
//      tone, BEFORE → AFTER table, risk tiers, etc). This is the value
//      the workflow prompt ADDS on top of the raw skill.
//
// Pre-6G these prompts re-stated each skill's tool-call sequence inline,
// drifted independently from the SKILL.md source, and (when the skill
// said "always call t2000_overview first") would silently lag whenever
// the skill grew a new pre-flight tool. 6G makes drift impossible by
// construction.
//
// Naming: workflow prompts keep their existing names (no `skill-` prefix
// — that namespace is owned by `skills-prompts.ts` which auto-registers
// every SKILL.md as `skill-<short-name>`).
// ---------------------------------------------------------------------------

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  composeSkillBody,
  composeSkillSections,
} from './compose-skills.js';
import { getBakedSkills, type SkillData } from './skills-prompts.js';

export interface RegisterPromptsOptions {
  /**
   * Inject a skills array (tests). Defaults to the baked bundle
   * via `getBakedSkills()`.
   */
  skills?: SkillData[];
}

export function registerPrompts(
  server: McpServer,
  opts: RegisterPromptsOptions = {},
): void {
  const skills = opts.skills ?? getBakedSkills();

  // ---------------------------------------------------------------------------
  // Advisor prompts — read-only orchestration + presentation framing
  // ---------------------------------------------------------------------------

  server.prompt(
    'financial-report',
    'Get a comprehensive summary of the agent\'s financial position — balance, savings, debt, health factor, and yield earnings.',
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'You are a financial advisor for a t2000 Agentic Wallet on Sui.',
            '',
            'STEP 1 — Render the account snapshot per the canonical skill:',
            '',
            composeSkillSections(
              't2000-account-report',
              ['Purpose', 'Engine orchestration (audric/web)'],
              { skills },
            ),
            '',
            'STEP 2 — Add an advisor layer ON TOP of the snapshot:',
            '',
            '📊 RECOMMENDATIONS (max 4)',
            '  Actionable items derived from the data:',
            '  • Idle funds in checking → suggest sweep to USDC savings',
            '  • Current USDC APY < best available → flag rate gap (compare via t2000_rates / t2000_all_rates)',
            '  • Pending protocol rewards > $0.01 → suggest t2000_claim_rewards',
            '  • Health factor < 2.0 → flag repayment priority',
            '',
            'Tone: data-driven, no fluff, max one paragraph of prose per recommendation.',
            'If everything is already optimal, say so clearly — don\'t invent problems.',
          ].join('\n'),
        },
      }],
    }),
  );

  server.prompt(
    'optimize-yield',
    'Analyze USDC savings — rate comparisons across protocols, idle funds, claimable rewards.',
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'You are a yield optimization specialist for a t2000 Agentic Wallet on Sui.',
            '',
            'CONTEXT (USDC-canonical save policy — from the t2000-save skill):',
            '',
            composeSkillSections('t2000-save', ['Purpose'], { skills }),
            '',
            'STEP 1 — Gather the data (call in parallel):',
            '  • t2000_overview — full account state + pending rewards',
            '  • t2000_rates — current USDC save + borrow rates',
            '  • t2000_all_rates — per-protocol USDC APY comparison (informational)',
            '',
            'STEP 2 — Present the analysis:',
            '',
            '📊 YIELD ANALYSIS',
            '─────────────────',
            '  Current    USDC on [protocol] · X.XX% APY',
            '  Best USDC  [protocol] · X.XX% APY',
            '  APY gap    +X.XX% (if any)',
            '',
            'STEP 3 — Recommend (in priority order):',
            '  • Idle checking → t2000_save (deploys at best USDC rate)',
            '  • Pending rewards → t2000_claim_rewards',
            '  • Sub-optimal position → withdraw + save (preview with dryRun first)',
            '',
            'If already at best USDC rate AND no idle funds AND no rewards: say "You\'re optimized."',
          ].join('\n'),
        },
      }],
    }),
  );

  server.prompt(
    'savings-strategy',
    'Analyze idle funds in checking and recommend a savings strategy — how much to save, expected yield, best rates.',
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'You are a savings advisor for a t2000 Agentic Wallet on Sui.',
            '',
            'WHICH ASSETS CAN BE SAVED (from the t2000-save skill — canonical):',
            '',
            composeSkillSections('t2000-save', ['Purpose'], { skills }),
            '',
            'STEP 1 — Read the account state (call t2000_overview + t2000_all_rates in parallel).',
            '',
            'STEP 2 — Recommend:',
            '  • How much idle checking to move (keep ~$5 SUI buffer for gas)',
            '  • Which protocol offers the best USDC APY (cite t2000_all_rates)',
            '  • Expected monthly/annual yield on the recommended amount',
            '  • Whether the current position lags the best available rate',
            '',
            'If the user wants to proceed, execute via t2000_save.',
          ].join('\n'),
        },
      }],
    }),
  );

  server.prompt(
    'sweep',
    'Find idle funds in checking and move to savings for maximum yield.',
    {
      keepBuffer: z.number().optional().describe('Dollar amount to keep in checking as spending buffer (default: $5)'),
    },
    async ({ keepBuffer }) => {
      const buffer = keepBuffer ?? 5;
      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: [
              'You are a money-routing assistant for a t2000 Agentic Wallet on Sui.',
              '',
              'SAVE ELIGIBILITY (from the t2000-save skill):',
              '',
              composeSkillSections('t2000-save', ['Purpose'], { skills }),
              '',
              `STEP 1 — Call t2000_overview and t2000_all_rates in parallel. Keep $${buffer} in checking as gas buffer.`,
              '',
              `STEP 2 — Calculate sweep amount = available checking − $${buffer}.`,
              'If sweep amount < $1, funds are already optimized; say so and stop.',
              '',
              'STEP 3 — Present the plan:',
              '',
              '🧹 SWEEP PLAN',
              '─────────────',
              `Available to sweep: $X (keeping $${buffer} buffer)`,
              '',
              'Actions (in order):',
              '  1. Save $X to best USDC rate (t2000_save; cite APY from t2000_rates / t2000_all_rates)',
              '  2. Claim pending rewards (if available)',
              '',
              'Projected monthly yield: $X.XX (before) → $X.XX (after)',
              '',
              'STEP 4 — Ask to confirm, then execute sequentially.',
            ].join('\n'),
          },
        }],
      };
    },
  );

  server.prompt(
    'risk-check',
    'Full risk analysis — health factor, concentration, lending exposure, unrealized losses, liquidation proximity.',
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'You are a risk assessment specialist for a t2000 Agentic Wallet on Sui.',
            '',
            'STEP 1 — Read the account state (use the t2000-account-report skill\'s tool sequence):',
            '',
            composeSkillSections(
              't2000-account-report',
              ['Engine orchestration (audric/web)'],
              { skills },
            ),
            '',
            'HEALTH FACTOR RULES (from the t2000-borrow skill — canonical):',
            '',
            composeSkillSections(
              't2000-borrow',
              ['Pre-borrow safety check (always runs)'],
              { skills },
            ),
            '',
            'STEP 2 — Present the risk report:',
            '',
            '🛡️ RISK REPORT',
            '──────────────',
            '1. LIQUIDATION RISK — Health factor + distance to liquidation (cite HF rules above)',
            '2. CONCENTRATION RISK — % per account type, % per asset',
            '3. PROTOCOL EXPOSURE — Lending protocol distribution',
            '4. YIELD EFFICIENCY — Idle assets, sub-optimal rates',
            '',
            'OVERALL TIER: Low / Medium / High / Critical',
            '',
            'End with max 3 prioritized actions. If Low risk, say so — don\'t invent problems.',
          ].join('\n'),
        },
      }],
    }),
  );

  server.prompt(
    'weekly-recap',
    'Week in review — transactions, yield earned, savings performance, highlights.',
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'You are a personal finance newsletter writer for a t2000 Agentic Wallet on Sui.',
            '',
            'STEP 1 — Read the account state (use the t2000-account-report tool sequence) + t2000_history (limit: 50) in parallel:',
            '',
            composeSkillSections(
              't2000-account-report',
              ['Engine orchestration (audric/web)'],
              { skills },
            ),
            '',
            'STEP 2 — Render the recap:',
            '',
            '📊 WEEKLY RECAP',
            '───────────────',
            '💰 Net Worth: $X — Checking $X | Savings $X',
            '📈 Activity: X sends, X saves, X withdrawals',
            '💸 Yield: $X.XX this week, X% APY, $X/month projected',
            '🎁 Rewards: Pending? Claim suggestion',
            '👉 Next Week: 1-2 actionable suggestions',
            '',
            'Tone: confident, concise, data-driven. Bloomberg brief, not blog post.',
          ].join('\n'),
        },
      }],
    }),
  );

  // ---------------------------------------------------------------------------
  // Action prompts — initiate a write via the canonical skill
  // ---------------------------------------------------------------------------

  server.prompt(
    'send-money',
    'Guided flow for sending USDC to a Sui address — validates address, checks limits, previews before signing.',
    {
      to: z.string().optional().describe('Recipient Sui address'),
      amount: z.number().optional().describe('Amount in dollars'),
    },
    async ({ to, amount }) => {
      const context = [
        to ? `Recipient address: ${to}` : '',
        amount ? `Amount: $${amount}` : '',
      ].filter(Boolean).join('\n');

      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: [
              'You are a payment assistant for a t2000 Agentic Wallet on Sui.',
              '',
              context ? `Context provided by the user:\n${context}\n` : '',
              'CANONICAL SEND FLOW (from the t2000-send skill — DO NOT skip steps):',
              '',
              composeSkillSections(
                't2000-send',
                ['Purpose', 'Pre-flight checks (automatic)', 'Recipient resolution flow'],
                { skills },
              ),
              '',
              'EXECUTION CHECKLIST:',
              '  1. If recipient or amount is missing, ask the user.',
              '  2. Preview with t2000_send dryRun: true.',
              '  3. Show the preview (amount, recipient, remaining balance, safeguard status).',
              '  4. Ask the user to confirm.',
              '  5. Execute with t2000_send dryRun: false.',
              '  6. Show the result + Suiscan link.',
            ].join('\n'),
          },
        }],
      };
    },
  );

  server.prompt(
    'budget-check',
    'Can I afford to spend $X? Checks balance, daily limit remaining, and whether spending would impact savings.',
    {
      amount: z.number().optional().describe('Amount in dollars to check'),
    },
    async ({ amount }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'You are a budget advisor for a t2000 Agentic Wallet on Sui.',
            '',
            amount
              ? `The user wants to know if they can afford to spend $${amount}.`
              : 'The user wants a general spending check.',
            '',
            'WHAT THE BALANCE TOOL RETURNS (from the t2000-check-balance skill):',
            '',
            composeSkillSections(
              't2000-check-balance',
              ['Purpose'],
              { skills },
            ),
            '',
            'SAFEGUARD CONTROLS (from the t2000-safeguards skill):',
            '',
            composeSkillSections(
              't2000-safeguards',
              ['Controls'],
              { skills },
            ),
            '',
            'STEP 1 — Call t2000_balance and t2000_config (action: "show") in parallel.',
            '',
            'STEP 2 — Calculate:',
            '  • Available checking',
            '  • Daily limit remaining (cap − amount spent today)',
            '  • What % of total wealth this spend represents',
            '',
            'STEP 3 — Give a yes/no answer with context:',
            '  • Can they afford it from checking?',
            '  • Would it hit their daily send limit?',
            '  • What balance would remain after?',
            '  • If it\'s a large % of total wealth, flag that.',
          ].join('\n'),
        },
      }],
    }),
  );

  server.prompt(
    'what-if',
    'Scenario planning — "What if I save $X?" or "What if I borrow $X?" Shows projected impact on yield and risk.',
    {
      scenario: z.string().optional().describe('Scenario to evaluate, e.g. "save $500" or "withdraw all savings" or "borrow $200"'),
    },
    async ({ scenario }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'You are a financial scenario planner for a t2000 Agentic Wallet on Sui.',
            '',
            scenario
              ? `The user wants to evaluate: "${scenario}"`
              : 'The user wants to explore a hypothetical financial scenario. Ask them what they\'re considering.',
            '',
            'STEP 1 — Read the current state (call t2000_overview first).',
            '',
            'STEP 2 — Identify the scenario type and apply the matching skill rules:',
            '',
            'IF THE SCENARIO IS A SAVE (t2000-save skill):',
            composeSkillSections('t2000-save', ['Purpose'], { skills }),
            '',
            'IF THE SCENARIO IS A BORROW (t2000-borrow skill — HF rules CANNOT be skipped):',
            composeSkillSections(
              't2000-borrow',
              ['Pre-borrow safety check (always runs)'],
              { skills },
            ),
            '',
            'IF THE SCENARIO IS A WITHDRAW (t2000-withdraw skill):',
            composeSkillSections(
              't2000-withdraw',
              ['Safety check (active when debt exists)'],
              { skills },
            ),
            '',
            'STEP 3 — Preview the specific action with dryRun: true.',
            '',
            'STEP 4 — Present BEFORE → AFTER:',
            '',
            '📊 SCENARIO: [description]',
            '              Before    After',
            '  Checking    $XX.XX    $XX.XX',
            '  Savings     $XX.XX    $XX.XX',
            '  HF          X.XX      X.XX  (if borrow/withdraw)',
            '',
            'STEP 5 — Smart guard: if action would drop total < $5, warn about gas.',
            'End with: "Want me to go ahead?" — ready to execute on confirmation.',
          ].join('\n'),
        },
      }],
    }),
  );

  // ---------------------------------------------------------------------------
  // Operational prompts — specific workflows
  // ---------------------------------------------------------------------------

  server.prompt(
    'claim-rewards',
    'Check for pending protocol rewards across all lending positions and claim them — auto-converts to USDC.',
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'You are a rewards management assistant for a t2000 Agentic Wallet on Sui.',
            '',
            // No dedicated claim-rewards skill — the flow is operational
            // enough that a thin prompt suffices. Future: if a
            // `t2000-rewards` skill lands, compose it here.
            'STEP 1 — Check what\'s claimable:',
            '  • t2000_pending_rewards — preview claimable amounts per protocol (no signature, no fee)',
            '  • t2000_positions — confirm which positions accrued rewards',
            '',
            'STEP 2 — Present findings:',
            '',
            '  IF rewards are available:',
            '    Show which positions have rewards and from which protocols.',
            '    Explain: "These are protocol incentive tokens (e.g. vSUI, sSUI, DEEP) that accrue on your lending positions."',
            '    Ask: "Want me to claim and convert them to USDC?"',
            '',
            '  IF no rewards are claimable:',
            '    Say the rewards are still accruing and to check back later.',
            '    Show current positions + APY so they know yield is being earned.',
            '',
            'STEP 3 — Execute the claim:',
            '  • t2000_claim_rewards — claims from ALL protocols, auto-converts to USDC',
            '  • Or t2000_harvest_rewards — claim + swap + deposit into savings as a single atomic PTB (one-shot compounding)',
            '  • Show result: USDC received, source protocols, transaction link',
            '  • If received amount < $0.01, explain that rewards accrue continuously',
            '',
            'STEP 4 — Follow-up:',
            '  Show updated balance after claiming.',
            '  Mention when to claim next — weekly or monthly is typical.',
          ].join('\n'),
        },
      }],
    }),
  );

  server.prompt(
    'safeguards',
    'Review account safety settings — per-transaction limits, daily caps, emergency lock, PIN-protected operations.',
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'You are a security advisor for a t2000 Agentic Wallet on Sui.',
            '',
            'CANONICAL SAFEGUARDS REFERENCE (from the t2000-safeguards skill — full body):',
            '',
            composeSkillBody('t2000-safeguards', { skills }),
            '',
            'STEP 1 — Show current settings:',
            '  • Call t2000_config (action: "show")',
            '  • Surface: per-transaction limit, daily send limit, daily spent today, lock status',
            '',
            'STEP 2 — Explain each safeguard using the reference above. Translate technical names',
            '  ("maxPerTx", "maxDailyUsd") into plain language for the user.',
            '',
            'STEP 3 — Recommend appropriate limits based on the user\'s balance:',
            '  • Large balances → tighter per-tx limits',
            '  • New accounts → start conservative',
            '  • Always confirm before changing limits via t2000_config (action: "set")',
            '',
            'STEP 4 — Emergency actions:',
            '  • If the user wants to lock: run t2000_lock immediately (no confirmation needed)',
            '  • Remind: unlocking requires the CLI with PIN — `t2000 unlock`',
          ].join('\n'),
        },
      }],
    }),
  );

  // ---------------------------------------------------------------------------
  // Customer-centric prompts — what real users actually ask
  // ---------------------------------------------------------------------------

  server.prompt(
    'onboarding',
    'New user setup guide — deposit, first save, set safeguards, explore features.',
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'You are a friendly onboarding guide for t2000 — an Agentic Wallet on Sui.',
            '',
            'STEP 1 — Read the user\'s current state (t2000_overview).',
            '',
            'STEP 2 — Branch the flow based on balance:',
            '',
            '👋 WELCOME TO T2000',
            '───────────────────',
            '',
            'IF balance == $0 (no funds yet):',
            '  Call t2000_deposit_info to get the agent\'s wallet address + supported assets.',
            '  Then explain how to receive funds, using the t2000-receive skill as the canonical reference:',
            '',
            composeSkillSections('t2000-receive', ['Purpose'], { skills }),
            '',
            '  Tell them: they need a small amount of SUI for gas (~$1 worth).',
            '',
            'IF balance > $0 but nothing saved yet:',
            '  "Great, you have $X ready to go. Here\'s what you can do:"',
            '',
            '  SAVE — earn yield (t2000-save skill, canonical):',
            composeSkillSections('t2000-save', ['Purpose'], { skills }),
            '',
            '  SEND — transfer USDC (t2000-send skill, see purpose).',
            '  PAY — use USDC for premium API services (MPP).',
            '',
            '  SAFEGUARDS — set spending limits for accounts > $100:',
            composeSkillSections('t2000-safeguards', ['Purpose'], { skills }),
            '',
            'IF they already have savings:',
            '  "You\'re set up. Quick status:" — mini summary (balance + savings + APY),',
            '  then offer to optimize (suggest the `optimize-all` or `optimize-yield` prompts).',
            '',
            'End with: "What would you like to do first?"',
          ].join('\n'),
        },
      }],
    }),
  );

  server.prompt(
    'emergency',
    'Something is wrong — lock account, assess damage, take protective actions immediately.',
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'You are an emergency response handler for a t2000 Agentic Wallet on Sui.',
            '',
            '🚨 EMERGENCY PROTOCOL',
            '─────────────────────',
            '',
            'IF the user says "lock", "freeze", "hack", "stolen", or "emergency":',
            '  → Run t2000_lock IMMEDIATELY. No confirmation needed for locking.',
            '  → Then gather information.',
            '',
            'SAFEGUARD CONTROLS (from the t2000-safeguards skill):',
            '',
            composeSkillSections('t2000-safeguards', ['Controls'], { skills }),
            '',
            'STEP 1 — Lock first, ask later:',
            '  Run t2000_lock to freeze ALL operations.',
            '  Confirm: "Account locked. No transactions can be executed."',
            '  Explain: unlocking requires the CLI with the user\'s PIN — `t2000 unlock`.',
            '',
            'STEP 2 — Assess the situation:',
            '  • Call t2000_overview to see current state',
            '  • Call t2000_history (limit: 20) to check recent activity',
            '  • Look for suspicious activity: unexpected sends, large withdrawals, unfamiliar addresses',
            '',
            'STEP 3 — Report findings:',
            '  • Show current balances (funds still there?)',
            '  • Flag any suspicious transactions with amounts and timestamps',
            '  • Include Suiscan links so the user can verify on-chain',
            '',
            'STEP 4 — Recovery guidance:',
            '  • Funds safe: "Your funds are secure. The lock prevents further transactions."',
            '  • Suspicious tx found: "Review this transaction: [link]. If unauthorized, your remaining funds are now locked."',
            '  • Remind: "To unlock, use: t2000 unlock (with PIN)"',
            '  • Recommend: "Consider rotating your key after investigating."',
          ].join('\n'),
        },
      }],
    }),
  );

  server.prompt(
    'optimize-all',
    'One-shot full optimization — sweep idle USDC to savings, compare USDC APYs, claim rewards.',
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'You are a full-account optimizer for a t2000 Agentic Wallet on Sui.',
            '',
            'STEP 1 — Read the account state in parallel: call t2000_overview AND t2000_all_rates.',
            '       For MCP clients with canvas rendering, also use the t2000-account-report tool sequence:',
            '',
            composeSkillSections(
              't2000-account-report',
              ['Engine orchestration (audric/web)'],
              { skills },
            ),
            '',
            'WHAT CAN BE SAVED (from the t2000-save skill):',
            composeSkillSections('t2000-save', ['Purpose'], { skills }),
            '',
            'WHEN TO REBALANCE (from the t2000-rebalance skill):',
            composeSkillSections('t2000-rebalance', ['When to use'], { skills }),
            '',
            'STEP 2 — Identify optimization levers and present a plan BEFORE executing:',
            '',
            '🔧 FULL OPTIMIZATION',
            '────────────────────',
            '',
            '1. IDLE FUNDS — checking > $5? → t2000_save (preview with dryRun)',
            '2. USDC APY GAP — current savings APY < best available? → withdraw + save plan',
            '3. PENDING REWARDS — any unclaimed? → t2000_claim_rewards or t2000_harvest_rewards',
            '4. STALE ALLOCATIONS — any non-USDC tokens that should be swap-and-saved? → t2000_swap then t2000_save (see t2000-rebalance for atomic version)',
            '',
            'STEP 3 — Present the summary table:',
            '',
            '  Action           | Impact            | Status',
            '  ─────────────────|───────────────────|──────────',
            '  Sweep $X idle    | +$X.XX/month      | Ready',
            '  USDC APY gap     | +X.XX% (info)     | Note',
            '  Claim rewards    | $X.XX             | Ready',
            '  Already optimal  | —                 | Skipped',
            '',
            'STEP 4 — Ask "Want me to execute all ready actions?" — execute sequentially as confirmed.',
            'If everything is already optimal, say so clearly. Do not invent work.',
          ].join('\n'),
        },
      }],
    }),
  );

  // [SPEC 17 — 2026-05-07] `savings-goal` MCP prompt removed alongside
  // the audric-side SavingsGoal table + savings_goal_* engine tools.
  // [Pre-6G] `morning-briefing` was retired April 2026.
}
