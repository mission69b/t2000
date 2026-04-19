> **ARCHIVED — Fully implemented.** All five intelligence features (F1 Financial Profile, F2 Proactive Awareness, F3 Episodic Memory, F4 Conversation State, F5 Self-Evaluation) shipped with RE Phases 1-3. Prisma models, cron jobs, context assembly, and Settings UI are all live. This spec is preserved for design context only — do not treat status markers, prerequisites, or file paths as current. See `audric-build-tracker.md` for ground truth.

# audric — Intelligence Layer Spec

> Five features that make Audric genuinely intelligent, not just reliable.
>
> **Status:** Shipped — v1.2
> **Scope:** `@t2000/engine` + `audric/apps/web` + `t2000/apps/server`
> **Companion to:** `spec/REASONING_ENGINE.md`, `audric-feedback-loop-spec.md`, `audric-roadmap.md`
> **Shipped with:** Reasoning Engine (Phase 1–3).

---

## Changelog

| Version | Date | Changes |
|---|---|---|
| 1.0 | Apr 2026 | Initial spec |
| 1.1 | Apr 2026 | Fix: cron pattern matches actual t2000/audric split architecture. Fix: replace non-existent `provider.complete()` with raw Anthropic SDK calls. Fix: define `parseMemories()` and replace `stringSimilarity` with Jaccard coefficient. Fix: add `model` parameter to `buildFullDynamicContext()`. Fix: Upstash Redis `setex` → `set({ ex })`. Fix: Prisma back-relations on `User`. Fix: `ConversationLog.content` type guard for non-prose content. Fix: state transitions split across chat + resume routes. Fix: HF alert state transition moved to `/api/internal/hf-alert`. Fix: deduplicate profile DB query in context assembly. Fix: `max_tokens` raised to 2000 for inference calls. Fix: F3 uses `lastInferredAt` cursor instead of fixed 48h window. Fix: `post_error → idle` recovery transition added. Fix: `completedSteps` stores key values only, not full payloads. Fix: note F4 depends on `maxTokens` increase from RE Phase 1. |
| 1.2 | Apr 2026 | Fix: `db.` → `prisma` throughout both internal routes. Fix: `activeSessionId` resolved via `UpstashSessionStore.listByUser()`. Fix: `fetchEligibleUsersForInference` and `fetchUsersForMemoryExtraction` defined as calls to `/api/internal/notification-users`. Fix: `buildAdviceContext` moved to `engine-context.ts` and exported — noted in implementation tasks. Fix: misleading `stateManager.reset()` in prompt string replaced with plain instruction. Fix: `sourceSessionId` uses most recent log, not first. Fix: internal routes use `validateInternalKey` from `@/lib/internal-auth` for consistency. |

---

## Why this exists alongside the reasoning engine

The reasoning engine spec (`spec/REASONING_ENGINE.md`) solves **reliability** — the agent does what it's supposed to do, in the right order, without mistakes. Extended thinking, step guards, and skill recipes eliminate the failure modes documented in that spec's problem statement.

That is necessary but not sufficient. An agent that executes correctly but treats every session as a blank slate, never adapts to the person it's talking to, and only responds when spoken to is reliable but not intelligent. Claude feels intelligent because it does five things Audric currently doesn't:

1. It knows who you are and calibrates to you
2. It volunteers relevant context you didn't ask for
3. It remembers what you said, not just what it told you
4. It knows what state the conversation is in
5. It evaluates the quality of its own output before presenting it

These five features implement those five properties. Together with the reasoning engine, they define the first version of Audric that users will experience as a genuine financial advisor rather than a capable but impersonal tool.

---

## Feature overview and roadmap sequencing

| Feature | What it enables | Phase | Depends on |
|---|---|---|---|
| **F1: User Financial Profile** | Personalised responses calibrated to risk appetite, literacy, goals | RE Phase 2 | `User` table (done), `ConversationLog` (done) |
| **F2: In-Session Proactive Awareness** | Agent volunteers relevant context without being asked | RE Phase 1 | Extended thinking (RE Phase 1), `maxTokens` ≥ 8192 |
| **F3: Episodic User Memory** | Remembers what users said across sessions | RE Phase 3 | `ConversationLog` (done), t2000 cron (done) |
| **F4: Conversation State Machine** | Tracks session state for interruption handling and recipe continuity | RE Phase 1 | Redis (done), `maxTokens` ≥ 8192 |
| **F5: Post-Action Self-Evaluation** | Agent verifies its own output before presenting it | RE Phase 1 | Extended thinking (RE Phase 1) |

**RE = Reasoning Engine phase**. F2 and F5 are system prompt additions — zero new infrastructure. F1, F3, F4 require new Prisma tables and backend work following the established cron pattern.

**Prerequisite:** RE Phase 1 must raise `maxTokens` from the current 2048 to at minimum 8192 (medium effort) and 16000 (high effort). F2, F4, and F5 depend on the thinking budget being large enough to reason through their instructions. This is called out in `spec/REASONING_ENGINE.md` Implementation Plan Phase 1.

---

## Architecture: cron pattern

F1 and F3 require background inference jobs. These must follow the established t2000/Audric split — **not** a hypothetical standalone ECS handler path.

**Correct pattern (matches briefings.ts, hfAlerts.ts):**

```
t2000/apps/server/src/cron/jobs/profile-inference.ts
  └── calls POST audric/apps/web/app/api/internal/profile-inference/route.ts
        └── protected by x-internal-key (AUDRIC_INTERNAL_KEY)
              └── does DB work + LLM call + Prisma writes
```

Same split for F3:
```
t2000/apps/server/src/cron/jobs/memory-extraction.ts
  └── calls POST audric/apps/web/app/api/internal/memory-extraction/route.ts
```

All file paths in this spec use the actual repo layout:
- Audric routes: `audric/apps/web/app/api/...`
- Audric lib: `audric/apps/web/lib/...`
- Audric schema: `audric/apps/web/prisma/schema.prisma`
- t2000 cron: `t2000/apps/server/src/cron/jobs/...`

---

## F1: User Financial Profile

> **Dependencies:** RE Phase 2 (guards must be running so profile + guards shape agent behaviour together). See `audric-build-tracker.md` RE-2.2 → F1.

### Problem

Every Audric session starts from zero. A user who has said "I'm saving aggressively for a house deposit" in five past conversations still receives generic savings nudges. A user who clearly understands DeFi mechanics still receives the "health factor means your collateral value divided by your borrow" explainer every time they take out a loan. A user who always thinks in fiat terms still sees raw USDC amounts without dollar framing.

The agent has no model of the person it's talking to. This is the single largest gap between "a financial chatbot" and "a financial advisor who knows you."

### What it is

A structured profile inferred from conversation behaviour — not declared by the user. Updated continuously by a background cron that analyses recent `ConversationLog` turns. Injected into every engine session alongside balance and advice context.

### Schema

```prisma
// audric/apps/web/prisma/schema.prisma

model UserFinancialProfile {
  id                    String   @id @default(cuid())
  userId                String   @unique

  // Inferred financial behaviour
  riskAppetite          String   @default("moderate")
  // 'conservative' | 'moderate' | 'aggressive'

  financialLiteracy     String   @default("novice")
  // 'novice' | 'intermediate' | 'advanced'

  // Communication preferences (inferred)
  prefersBriefResponses Boolean  @default(false)
  prefersExplainers     Boolean  @default(true)

  currencyFraming       String   @default("usdc")
  // 'usdc' | 'fiat'

  primaryGoals          String[] @default([])
  // Max 5 — older goals pruned when new ones added

  knownPatterns         String[] @default([])
  // Inferred when same action repeats 3+ times on same schedule

  // Confidence scores
  riskConfidence        Float    @default(0.0)
  literacyConfidence    Float    @default(0.0)

  lastInferredAt        DateTime?
  inferenceVersion      Int      @default(0)
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  user                  User     @relation(fields: [userId], references: [id])
}

// Addition required to existing User model:
// financialProfile   UserFinancialProfile?
// memories           UserMemory[]
```

**Back-relations on `User` model (required for `prisma generate`):**
```prisma
// In the existing model User { ... } block — add these two lines:
financialProfile     UserFinancialProfile?
memories             UserMemory[]
```

### Cron job (t2000 side)

```typescript
// t2000/apps/server/src/cron/jobs/profile-inference.ts
// Pattern matches briefings.ts — calls Audric internal API for each eligible user

// Follows the same pattern as notification-users: calls Audric internal API with a
// source param to get users eligible for this job.
async function fetchEligibleUsersForInference(): Promise<string[]> {
  const res = await fetch(
    `${process.env.AUDRIC_INTERNAL_URL}/api/internal/notification-users?source=profile-inference`,
    { headers: { 'x-internal-key': process.env.AUDRIC_INTERNAL_KEY! } },
  );
  if (!res.ok) throw new Error(`notification-users failed: ${res.status}`);
  const { userIds } = await res.json();
  return userIds as string[];
  // Audric's /api/internal/notification-users handles the eligibility logic:
  // users with ≥5 conversation turns in last 30 days AND lastInferredAt > 24h ago
}

export async function runProfileInference(): Promise<void> {
  const eligibleUsers = await fetchEligibleUsersForInference();

  for (const userId of eligibleUsers) {
    try {
      await fetch(`${process.env.AUDRIC_INTERNAL_URL}/api/internal/profile-inference`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': process.env.AUDRIC_INTERNAL_KEY!,
        },
        body: JSON.stringify({ userId }),
      });
    } catch (err) {
      console.error(`Profile inference failed for ${userId}:`, err);
      // Don't rethrow — one user failure shouldn't stop the batch
    }
  }
}
```

### Internal API route (Audric side)

```typescript
// audric/apps/web/app/api/internal/profile-inference/route.ts

import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/prisma';
import { validateInternalKey } from '@/lib/internal-auth';

const anthropic = new Anthropic(); // Uses ANTHROPIC_API_KEY from env

export async function POST(req: Request) {
  if (!validateInternalKey(req)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { userId } = await req.json();

  const logs = await prisma.conversationLog.findMany({\
    where: {
      userId,
      createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
      role: 'user',
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
    select: { content: true, createdAt: true },
  });

  if (logs.length < 5) return Response.json({ skipped: true });

  const existing = await prisma.userFinancialProfile.findUnique({ where: { userId } });

  // Filter out non-prose content (tool call JSON, structured blocks)
  // ConversationLog.content can contain JSON-serialised tool blocks for assistant turns,
  // but we query role:'user' only. Still guard against edge cases.
  const proseMessages = logs
    .map(l => l.content)
    .filter(c => c && !c.trimStart().startsWith('{') && !c.trimStart().startsWith('['))
    .filter(c => c.length > 3); // Skip one-word responses

  if (proseMessages.length < 3) return Response.json({ skipped: true });

  const messages = proseMessages.join('\n');

  // Raw Anthropic SDK call — no engine overhead needed for single-turn structured output
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000, // 2000 to accommodate thinking + JSON output safely
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low' },
    messages: [{
      role: 'user',
      content: buildInferencePrompt(messages, existing),
    }],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    return Response.json({ error: 'no text response' }, { status: 500 });
  }

  const update = parseProfileUpdate(textBlock.text);

  await prisma.userFinancialProfile.upsert({
    where: { userId },
    update: { ...update, inferenceVersion: { increment: 1 }, lastInferredAt: new Date() },
    create: { userId, ...update, lastInferredAt: new Date() },
  });

  return Response.json({ ok: true });
}

function buildInferencePrompt(messages: string, existing: UserFinancialProfile | null): string {
  return `You are analysing a user's conversation history with a financial AI assistant to infer their financial profile.

Existing profile (if any):
${existing ? JSON.stringify({
  riskAppetite: existing.riskAppetite,
  financialLiteracy: existing.financialLiteracy,
  primaryGoals: existing.primaryGoals,
  knownPatterns: existing.knownPatterns,
}, null, 2) : 'None — first inference'}

Recent user messages:
${messages}

Infer the following. Only update fields where evidence is strong (3+ consistent signals).
Respond ONLY with a valid JSON object, no preamble, no markdown fences:

{
  "riskAppetite": "conservative|moderate|aggressive|null",
  "riskConfidence": 0.0,
  "financialLiteracy": "novice|intermediate|advanced|null",
  "literacyConfidence": 0.0,
  "prefersBriefResponses": true|false|null,
  "prefersExplainers": true|false|null,
  "currencyFraming": "usdc|fiat|null",
  "primaryGoals": [],
  "knownPatterns": []
}

Rules:
- null = insufficient evidence, do not update this field
- Only infer from user's own words — not from Audric's responses
- "aggressive" requires 3+ instances of: borrowing, DCA into volatile assets, or explicit statements
- "advanced" literacy requires unprompted DeFi terminology or protocol mechanics questions
- Patterns require 3+ repetitions on same schedule
- Goals must be explicitly stated, not inferred from actions`;
}

function parseProfileUpdate(raw: string): Partial<UserFinancialProfile> {
  const clean = raw.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);
  // Strip null values — only update fields with actual signals
  return Object.fromEntries(
    Object.entries(parsed).filter(([, v]) => v !== null)
  );
}
```

### Engine context injection

```typescript
// audric/apps/web/lib/engine-context.ts

export function buildProfileContext(profile: UserFinancialProfile | null): string {
  // Profile is passed in — fetched once in buildFullDynamicContext, not re-queried here
  if (!profile || profile.riskConfidence < 0.3) return '';

  const lines: string[] = ['User financial profile (inferred from conversation history):'];

  if (profile.riskConfidence >= 0.5) {
    lines.push(`- Risk appetite: ${profile.riskAppetite}`);
  }
  if (profile.literacyConfidence >= 0.5) {
    lines.push(`- Financial literacy: ${profile.financialLiteracy}`);
    if (profile.financialLiteracy === 'advanced') {
      lines.push('  → Skip basic DeFi explanations (health factor, APY, etc). User knows these.');
    }
    if (profile.financialLiteracy === 'novice') {
      lines.push('  → Always explain DeFi concepts in plain language.');
    }
  }
  if (profile.currencyFraming === 'fiat') {
    lines.push('- Frame amounts as dollars (e.g. "$50" not "50 USDC")');
  }
  if (profile.prefersBriefResponses) {
    lines.push('- Prefers brief responses — be concise');
  }
  if (profile.primaryGoals.length > 0) {
    lines.push(`- Stated goals: ${profile.primaryGoals.join(', ')}`);
  }
  if (profile.knownPatterns.length > 0) {
    lines.push(`- Behavioural patterns: ${profile.knownPatterns.join(', ')}`);
  }

  return lines.join('\n');
}
```

Note: `buildProfileContext` now takes the profile object directly rather than fetching it — the caller (`buildFullDynamicContext`) fetches once and passes it to both `buildProfileContext` and `buildProactivenessInstructions`. This eliminates the double query from v1.0.

---

## F2: In-Session Proactive Awareness

### Problem

Audric only responds to what's asked. Claude volunteers relevant context — not because it was asked, but because it noticed something during the conversation that the user would want to know.

### What it is

A single addition to the system prompt's dynamic block. Zero infrastructure cost — enabled entirely by extended thinking (Reasoning Engine Phase 1).

### Implementation

```typescript
// audric/apps/web/lib/engine-context.ts

export function buildProactivenessInstructions(profile: UserFinancialProfile | null): string {
  // Profile passed in directly — no DB query here
  const brevityGuidance = profile?.prefersBriefResponses
    ? 'This user prefers brevity — only surface context if urgent or directly actionable.'
    : 'Surface relevant context when criteria are met.';

  const styleGuidance = profile?.financialLiteracy === 'novice'
    ? 'Frame observations in plain English, no DeFi jargon.'
    : 'Technical framing is fine.';

  return `Proactive awareness:
After completing the user's request, consider whether ONE additional piece of financial
context is worth mentioning. ${brevityGuidance}

✓ Mention if:
- Their savings goal is materially off-track (>20% behind pace)
- Yield rate changed significantly since last session (>0.5%)
- They have idle USDC >$50 sitting for >48h
- An action they just took interacts with an active goal or debt position
- A pattern would materially benefit from their attention

✗ Do NOT mention if:
- Tangentially related but not actionable
- Already surfaced this session
- Requires more explanation than the original answer
- Would seem pushy or sales-y

${styleGuidance}
Format: One sentence maximum, after main response, separated by a line break.
Frame as observation, not advice: "Your Tokyo goal is $80 behind pace." — not "You should deposit more."`;
}
```

### What this produces in context

```
User: "swap 10 SUI to USDC"

Audric: Swapped 10 SUI → 8.73 USDC at $0.873/SUI. 0.1% platform fee applied.
Checking balance: $58.73 USDC.

Your Tokyo fund is $112 behind its weekly pace — you now have enough idle USDC to catch up.
```

```
User: "repay $50"

Audric: Repaid $50 USDC. Health factor improved from 1.6 → 2.1. Outstanding borrow: $150.

[Nothing added — health factor is now safe, no further observation warranted]
```

---

## F3: Episodic User Memory

> **Dependencies:** Build tracker task 2.5.5 (Settings > Memory page scaffold) must exist first. RE Phase 3 (skill recipes via RE-3.1) should be active so extraction captures richer session data. See `audric-build-tracker.md` F3 row.

### Problem

The `AdviceLog` (from `audric-feedback-loop-spec.md`) remembers what *Audric* advised. The `UserFinancialProfile` (F1) remembers *who the user is*. Neither captures *what the user said* — stated intentions, expected events, life context.

### Schema

```prisma
// audric/apps/web/prisma/schema.prisma

model UserMemory {
  id              String    @id @default(cuid())
  userId          String

  memoryType      String
  // 'intention' | 'expectation' | 'constraint' | 'life_event' | 'preference' | 'relationship'

  content         String    // Plain English summary, max 200 chars
  originalQuote   String?   // Exact user words — debug/audit only, never injected into engine

  confidence      Float     @default(1.0)
  expiresAt       DateTime?
  active          Boolean   @default(true)

  sourceSessionId String
  extractedAt     DateTime  @default(now())

  user            User      @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([userId, active])
  @@index([expiresAt])
}
```

**Expiry defaults by type:**

| Type | Expiry | Rationale |
|---|---|---|
| `expectation` | 14 days | "Expecting a payment next week" goes stale |
| `constraint` | 7 days | "Need $500 for rent on the 1st" is time-bounded |
| `intention` | 90 days | Goals without a deadline |
| `life_event` | 180 days | Job change, relationship |
| `preference` | Never | "I prefer not to use credit" is durable |
| `relationship` | Never | "Saving with my partner" is durable |

### Cron job (t2000 side)

```typescript
// t2000/apps/server/src/cron/jobs/memory-extraction.ts

// Same pattern as profile-inference — calls notification-users with source param
async function fetchUsersForMemoryExtraction(): Promise<string[]> {
  const res = await fetch(
    `${process.env.AUDRIC_INTERNAL_URL}/api/internal/notification-users?source=memory-extraction`,
    { headers: { 'x-internal-key': process.env.AUDRIC_INTERNAL_KEY! } },
  );
  if (!res.ok) throw new Error(`notification-users failed: ${res.status}`);
  const { userIds } = await res.json();
  return userIds as string[];
  // Audric's /api/internal/notification-users handles eligibility:
  // users who had at least one conversation turn since their last memory extraction
}

export async function runMemoryExtraction(): Promise<void> {
  // Get users who had a session since last extraction ran
  const eligibleUsers = await fetchUsersForMemoryExtraction();

  for (const userId of eligibleUsers) {
    try {
      await fetch(`${process.env.AUDRIC_INTERNAL_URL}/api/internal/memory-extraction`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': process.env.AUDRIC_INTERNAL_KEY!,
        },
        body: JSON.stringify({ userId }),
      });
    } catch (err) {
      console.error(`Memory extraction failed for ${userId}:`, err);
    }
  }
}
```

### Internal API route (Audric side)

```typescript
// audric/apps/web/app/api/internal/memory-extraction/route.ts

import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/prisma';
import { validateInternalKey } from '@/lib/internal-auth';

const anthropic = new Anthropic();

export async function POST(req: Request) {
  if (!validateInternalKey(req)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { userId } = await req.json();

  // Use lastInferredAt cursor — not a fixed 48h window.
  // This prevents re-processing the same turns on consecutive daily runs.
  const lastExtraction = await prisma.userMemory.findFirst({
    where: { userId },
    orderBy: { extractedAt: 'desc' },
    select: { extractedAt: true },
  });

  const sinceDate = lastExtraction
    ? lastExtraction.extractedAt
    : new Date(Date.now() - 7 * 86_400_000); // First run: look back 7 days

  const recentLogs = await prisma.conversationLog.findMany({
    where: {
      userId,
      role: 'user',
      createdAt: { gt: sinceDate },
    },
    orderBy: { createdAt: 'asc' },
    select: { content: true, sessionId: true },
  });

  if (recentLogs.length === 0) return Response.json({ skipped: true });

  // Filter non-prose content (JSON blobs from tool results)
  const proseTurns = recentLogs
    .map(l => l.content)
    .filter(c => c && !c.trimStart().startsWith('{') && !c.trimStart().startsWith('['))
    .filter(c => c.length > 3);

  if (proseTurns.length === 0) return Response.json({ skipped: true });

  const existing = await prisma.userMemory.findMany({
    where: { userId, active: true },
    select: { content: true, memoryType: true },
  });

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low' },
    messages: [{
      role: 'user',
      content: buildExtractionPrompt(proseTurns, existing),
    }],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    return Response.json({ error: 'no text response' }, { status: 500 });
  }

  const memories = parseMemories(textBlock.text);

  for (const memory of memories) {
    // Dedup: exact type match + Jaccard similarity > 0.7 on content tokens
    const isDuplicate = existing.some(e =>
      e.memoryType === memory.memoryType &&
      jaccardSimilarity(e.content, memory.content) > 0.7
    );
    if (isDuplicate) continue;

    const expiresAt = memory.expiresInDays
      ? new Date(Date.now() + memory.expiresInDays * 86_400_000)
      : null;

    await prisma.userMemory.create({
      data: {
        userId,
        memoryType: memory.memoryType,
        content: memory.content,
        originalQuote: memory.originalQuote ?? null,
        expiresAt,
        sourceSessionId: recentLogs.at(-1)?.sessionId ?? recentLogs[0].sessionId, // Most recent session
      },
    });
  }

  // Soft-expire stale memories
  await prisma.userMemory.updateMany({
    where: { userId, expiresAt: { lte: new Date() }, active: true },
    data: { active: false },
  });

  return Response.json({ ok: true, extracted: memories.length });
}

// Jaccard similarity: intersection / union of word sets
// Avoids external dependency — sufficient for dedup at this scale
function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...setA].filter(w => setB.has(w)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function buildExtractionPrompt(
  turns: string[],
  existing: Array<{ content: string; memoryType: string }>,
): string {
  const messages = turns.join('\n');
  const existingStr = existing.map(e => `- [${e.memoryType}] ${e.content}`).join('\n');

  return `Extract memorable facts from these user messages in a financial assistant conversation.

User messages:
${messages}

Already stored memories (do not duplicate):
${existingStr || 'None'}

Extract ONLY explicit statements the user made about their financial situation, intentions,
constraints, or life context. Do NOT infer — only extract what was directly stated.

Respond ONLY with a valid JSON array (empty array [] if nothing to extract), no markdown fences:
[
  {
    "memoryType": "intention|expectation|constraint|life_event|preference|relationship",
    "content": "plain English summary max 200 chars",
    "originalQuote": "exact words from user message",
    "expiresInDays": null or number
  }
]

GOOD extractions:
- "I get paid on the 15th" → { memoryType: "constraint", content: "Gets paid on the 15th each month", expiresInDays: null }
- "saving for a house with my girlfriend" → { memoryType: "relationship", content: "Saving for house deposit with partner", expiresInDays: null }
- "expecting $3000 from a client by Friday" → { memoryType: "expectation", content: "Expecting $3000 client payment this week", expiresInDays: 10 }

BAD extractions (do not extract):
- General questions about how things work
- Responses to Audric's suggestions
- Non-financial sentiments
- Content already in stored memories`;
}

// Parse and validate the LLM's JSON array output
function parseMemories(raw: string): Array<{
  memoryType: string;
  content: string;
  originalQuote?: string;
  expiresInDays: number | null;
}> {
  const clean = raw.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);

  if (!Array.isArray(parsed)) return [];

  const validTypes = new Set(['intention', 'expectation', 'constraint', 'life_event', 'preference', 'relationship']);

  return parsed.filter(m =>
    m &&
    typeof m === 'object' &&
    validTypes.has(m.memoryType) &&
    typeof m.content === 'string' &&
    m.content.length > 0 &&
    m.content.length <= 200
  );
}
```

### Engine context injection

```typescript
// audric/apps/web/lib/engine-context.ts

export async function buildMemoryContext(userId: string): Promise<string> {
  const memories = await prisma.userMemory.findMany({
    where: {
      userId,
      active: true,
      OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
    },
    orderBy: { extractedAt: 'desc' },
    take: 8,
  });

  if (memories.length === 0) return '';

  const lines = memories.map(m => {
    const age = Math.round((Date.now() - m.extractedAt.getTime()) / 86_400_000);
    const ageStr = age === 0 ? 'today' : age === 1 ? 'yesterday' : `${age}d ago`;
    return `- [${m.memoryType}] ${m.content} (${ageStr})`;
  });

  return [
    "What this user has told you (reference naturally, don't recite verbatim):",
    ...lines,
    "Only mention these when directly relevant to the current query.",
  ].join('\n');
}
```

---

## F4: Conversation State Machine

### Problem

Every turn is treated identically — recipe in progress, error just occurred, first-ever session — all receive the same blank-slate treatment. This causes recipe abandonment confusion, double-confirmation friction, post-error blindness, and onboarding tone mismatch.

**Prerequisite:** RE Phase 1 must raise `maxTokens` from the current engine default of 2048 before F4 ships. The state context injected per turn (~60–200 tokens) plus thinking overhead requires headroom. `maxTokens: 8192` is the minimum.

### State definitions

```typescript
// packages/engine/src/types/conversation-state.ts

export type ConversationState =
  | { type: 'idle' }

  | {
      type: 'mid_recipe';
      recipeName: string;
      currentStep: number;
      totalSteps: number;
      // Store key values only — NOT full tool response payloads.
      // e.g. { swap: { received: 8.73, txHash: '0xabc' } }
      // NOT { swap: { received: 8.73, ...fullCetusResponse } }
      completedStepOutputs: Record<string, Record<string, string | number>>;
      startedAt: number;
    }

  | {
      type: 'awaiting_confirmation';
      action: string;
      amount?: number;
      recipient?: string;
      proposedAt: number;
      expiresAt: number; // 5 minutes from proposedAt
    }

  | {
      type: 'post_error';
      failedAction: string;
      errorMessage: string;
      occurredAt: number;
      partialState?: string; // e.g. "swap succeeded, deposit failed"
    }

  | {
      type: 'post_liquidation_warning';
      healthFactor: number;
      warnedAt: number;
    }

  | {
      type: 'onboarding';
      sessionNumber: number;
      hasBalance: boolean;
      hasSavedBefore: boolean;
    };

export type StateTransition =
  | { from: '*';                        to: 'idle';                      trigger: 'session_end' | 'explicit_reset' | 'new_successful_action' }
  | { from: 'idle';                     to: 'mid_recipe';                trigger: 'recipe_matched' }
  | { from: 'mid_recipe';               to: 'awaiting_confirmation';     trigger: 'confirmation_gate_reached' }
  | { from: 'awaiting_confirmation';    to: 'mid_recipe';                trigger: 'confirmed' }          // resume route
  | { from: 'awaiting_confirmation';    to: 'idle';                      trigger: 'declined_or_expired' } // resume route
  | { from: 'mid_recipe';               to: 'post_error';                trigger: 'step_failed' }
  | { from: 'mid_recipe';               to: 'idle';                      trigger: 'recipe_completed' }
  | { from: 'post_error';               to: 'idle';                      trigger: 'new_successful_action' }
  | { from: '*';                        to: 'post_liquidation_warning';  trigger: 'hf_below_threshold' }  // hf-alert route
  | { from: 'post_liquidation_warning'; to: 'idle';                      trigger: 'hf_recovered' };
```

Note the `post_error → idle` transition via `new_successful_action`. Without this, the post-error context is injected into every subsequent turn indefinitely. The transition fires when any tool call completes without error after a `post_error` state.

### Redis implementation

```typescript
// packages/engine/src/state/conversation-state.ts
// Uses @upstash/redis — the same client as UpstashSessionStore

import { Redis } from '@upstash/redis';

const STATE_TTL_SECONDS = 3600; // 1 hour

export class ConversationStateManager {
  // Redis.fromEnv() — matches existing Upstash usage pattern in Audric
  constructor(
    private redis: Redis,
    private sessionId: string,
  ) {}

  private key(): string {
    return `conv_state:${this.sessionId}`;
  }

  async get(): Promise<ConversationState> {
    try {
      const raw = await this.redis.get<string>(this.key());
      if (!raw) return { type: 'idle' };
      return JSON.parse(raw) as ConversationState;
    } catch {
      return { type: 'idle' }; // Fail open — never crash on state read
    }
  }

  async set(state: ConversationState): Promise<void> {
    // Upstash API: set(key, value, { ex: ttlSeconds }) — NOT setex()
    await this.redis.set(this.key(), JSON.stringify(state), { ex: STATE_TTL_SECONDS });
  }

  async transition(to: ConversationState): Promise<void> {
    await this.set(to);
  }

  async reset(): Promise<void> {
    await this.set({ type: 'idle' });
  }
}
```

### Engine context injection

```typescript
// audric/apps/web/lib/engine-context.ts

export function buildStateContext(state: ConversationState): string {
  switch (state.type) {
    case 'idle':
      return '';

    case 'mid_recipe': {
      const elapsed = Math.round((Date.now() - state.startedAt) / 60_000);
      // Only inject key output values — not full payloads
      const outputs = JSON.stringify(state.completedStepOutputs);
      return [
        `Conversation state: MID-RECIPE`,
        `Active recipe: ${state.recipeName} (step ${state.currentStep + 1} of ${state.totalSteps})`,
        `Started: ${elapsed} minutes ago`,
        `Completed step key outputs: ${outputs}`,
        `If the user asks an unrelated question: answer briefly, then offer to continue the ${state.recipeName} flow.`,
        `If the user says "cancel" or "stop": confirm you have abandoned the recipe and return to idle.`,
      ].join('\n');
    }

    case 'awaiting_confirmation': {
      const expiryMins = Math.max(0, Math.round((state.expiresAt - Date.now()) / 60_000));
      const expired = state.expiresAt < Date.now();
      return [
        `Conversation state: AWAITING CONFIRMATION`,
        `Proposed action: ${state.action}${state.amount ? ` for $${state.amount}` : ''}${state.recipient ? ` to ${state.recipient}` : ''}`,
        expired
          ? `Status: EXPIRED — ask if user still wants to proceed`
          : `Expires in: ${expiryMins} minutes`,
        `"yes/confirm/do it" → execute. "no/cancel/wait" → abort, reset to idle.`,
      ].join('\n');
    }

    case 'post_error':
      return [
        `Conversation state: POST-ERROR`,
        `Failed action: ${state.failedAction}`,
        `Error: ${state.errorMessage}`,
        state.partialState ? `Partial state: ${state.partialState}` : '',
        `Acknowledge failure clearly. Offer a specific recovery path if one exists.`,
        `This state clears automatically on the next successful action.`,
      ].filter(Boolean).join('\n');

    case 'post_liquidation_warning':
      return [
        `Conversation state: LIQUIDATION WARNING ACTIVE`,
        `Health factor: ${state.healthFactor.toFixed(2)} — below safe threshold`,
        `Prioritise debt repayment or collateral deposit.`,
        `Do not proceed with any action that would further reduce health factor.`,
      ].join('\n');

    case 'onboarding':
      return [
        `Conversation state: ONBOARDING (session ${state.sessionNumber})`,
        state.sessionNumber === 1
          ? 'First session — introduce capabilities through context, not a feature list.'
          : `Returning user — ${state.hasSavedBefore ? 'has saved before' : 'has not saved yet'}.`,
      ].join('\n');

    default:
      return '';
  }
}
```

### State transitions — where they happen

Transitions are written by application code, not by the LLM. They occur in **three places**:

#### 1. Chat route — initial message and tool execution

```typescript
// audric/apps/web/app/api/engine/chat/route.ts

// On recipe match (before first tool call)
if (matchedRecipe) {
  await stateManager.transition({
    type: 'mid_recipe',
    recipeName: matchedRecipe.name,
    currentStep: 0,
    totalSteps: matchedRecipe.steps.length,
    completedStepOutputs: {}, // Key values only, populated as steps complete
    startedAt: Date.now(),
  });
}

// On confirmation gate reached
if (guardResult.action === 'block' && guardResult.reason === 'requires_confirmation') {
  await stateManager.transition({
    type: 'awaiting_confirmation',
    action: toolName,
    amount: extractAmount(toolInput),
    proposedAt: Date.now(),
    expiresAt: Date.now() + 5 * 60_000,
  });
}

// On tool failure — store key outputs so far, not full payload
if (toolResult.isError) {
  await stateManager.transition({
    type: 'post_error',
    failedAction: toolName,
    errorMessage: toolResult.content,
    occurredAt: Date.now(),
    partialState: buildPartialStateDescription(completedStepOutputs, toolName),
  });
}

// On recipe completion
if (currentStep >= totalSteps) {
  await stateManager.reset();
}

// On successful action after post_error — clear error state
const currentState = await stateManager.get();
if (currentState.type === 'post_error' && !toolResult.isError) {
  await stateManager.reset();
}
```

#### 2. Resume route — confirmation responses

The `awaiting_confirmation → confirmed/declined` transitions happen here, **not** in the chat route. The resume route handles user responses to pending action confirmation cards.

```typescript
// audric/apps/web/app/api/engine/resume/route.ts

const state = await stateManager.get();

if (state.type === 'awaiting_confirmation') {
  if (userConfirmed) {
    // Resume the recipe or action
    await stateManager.transition({
      type: 'mid_recipe', // or back to idle if it was a one-shot confirmation
      // ... restore mid_recipe context if applicable
    });
  } else {
    // User declined or timed out
    await stateManager.reset();
  }
}
```

#### 3. HF alert internal route — external trigger

The `post_liquidation_warning` state is set by the HF alert, not by the chat route. The HF alert originates from the t2000 server's `hfAlerts.ts` cron, which calls `/api/internal/hf-alert`. The state write belongs there.

```typescript
// audric/apps/web/app/api/internal/hf-alert/route.ts (addition to existing handler)

// After verifying the alert and sending the notification:
// Resolve the user's most recent active session via UpstashSessionStore.
// The HF alert receives walletAddress, not a sessionId directly.
const sessions = await UpstashSessionStore.listByUser(payload.walletAddress);
const activeSessionId = sessions[0]; // Most recent session, sorted by recency

if (activeSessionId) {
  const stateManager = new ConversationStateManager(Redis.fromEnv(), activeSessionId);
  await stateManager.transition({
    type: 'post_liquidation_warning',
    healthFactor: payload.healthFactor,
    warnedAt: Date.now(),
  });
}
// If no active session: skip state write — warning already delivered via email/notification.
// State is only relevant when user opens the app, so a missing session is fine.
```

The chat route reads this state on the user's next turn and injects the liquidation context automatically.

### Interruption handling

```
User: "rebalance to 50/50 SUI/USDC"
→ State: mid_recipe (portfolio_rebalance, step 1/4)

User: "actually wait, what's the current SUI price?"
→ Engine reads mid_recipe state, knows context
→ "SUI is $0.87. Your rebalance is paused at step 1 — want to continue with $0.87, or recalculate?"

User: "continue"
→ Resumes from step 1 with SUI price context in completedStepOutputs
```

---

## F5: Post-Action Self-Evaluation

### Problem

Extended thinking reasons before acting. But once tools have executed and results returned, the agent has no structural mechanism to verify its output before presenting it. This produces presentation errors — not planning errors — that thinking cannot prevent: rounding estimates instead of quoting exact tool values, presenting partial success as full success, losing completeness when a user asked two things.

### What it is

A prompt addition to the dynamic system block. Zero infrastructure cost.

### Implementation

```typescript
// audric/apps/web/lib/engine-context.ts

export function buildSelfEvaluationInstruction(): string {
  return `Self-evaluation (apply silently before composing your response):

1. ACCURACY — Quote exact values from tool results, not estimates or rounded figures.
   Never combine post-action tool results with pre-action snapshot numbers.
   If the tool returned an error, label it as an error — do not paraphrase it as success.

2. STATE CONSISTENCY — Describe the actual outcome of all steps.
   Partial success (swap ok, deposit failed): describe both clearly.
   Never describe a failed action as if it succeeded.

3. COMPLETENESS — If the user asked multiple things, answer all of them.
   If you couldn't complete something, explain why and what the current state is.

4. TONE — Match tone to outcome.
   Success: confirming and forward-looking.
   Failure: clear about what failed, unchanged, and what to do next.
   Warning: specific risk, not generic caution.

If any check fails, rewrite before outputting.`;
}
```

### What this prevents

**Partial success (swap ok, deposit failed)**

Without: *"Swapped 10 SUI. Your savings are now earning 3.8% APY."* (presents failure as success)

With: *"Swapped 10 SUI → 8.73 USDC. The deposit step failed — your USDC is in checking. Deposit manually or ask me to retry."*

**Protocol fee not reflected**

Without: *"Deposited $50. Savings balance: $550."* (arithmetic from snapshot, ignores fee)

With: *"Deposited $50. Savings balance: $549.95 (0.1% protocol fee applied — from transaction result)."*

---

## Unified context assembly

All five features contribute to the dynamic system block injected per turn. Profile is fetched once and passed to both `buildProfileContext` and `buildProactivenessInstructions` — no double query.

```typescript
// audric/apps/web/lib/engine-context.ts

export async function buildFullDynamicContext(
  userId: string,
  sessionId: string,
  model: string,           // Passed in from engine config — used by classifyEffort()
  userMessage: string,
  toolCategories: ToolCategory[],
  matchedRecipe: Recipe | null,
  sessionWriteCount: number,
): Promise<{
  dynamicSystemBlock: string;
  thinkingConfig: ThinkingConfig;
  outputConfig: OutputConfig;
}> {
  // Fetch profile once — passed to both buildProfileContext and buildProactivenessInstructions
  const [profile, memories, adviceContext] = await Promise.all([
    prisma.userFinancialProfile.findUnique({ where: { userId } }),
    buildMemoryContext(userId),
    buildAdviceContext(userId), // From audric-feedback-loop-spec.md
    // Note: buildAdviceContext currently lives as a non-exported local function in
    // engine-factory.ts. It must be moved to engine-context.ts and exported as part
    // of this work — see implementation tasks (Unified context assembly section).
  ]);

  const stateManager = new ConversationStateManager(Redis.fromEnv(), sessionId);
  const state = await stateManager.get();

  const profileContext = buildProfileContext(profile);      // F1 — pass profile object
  const stateContext = buildStateContext(state);            // F4
  const proactiveness = buildProactivenessInstructions(profile); // F2 — pass same object
  const selfEval = buildSelfEvaluationInstruction();        // F5

  const dynamicSystemBlock = [
    profileContext,    // Who they are — lowest priority, furthest from current message
    memories,          // What they said
    adviceContext,     // What Audric advised previously
    stateContext,      // Where the conversation is — high priority
    proactiveness,     // What to volunteer after main task
    selfEval,          // Verify before output — highest priority, closest to generation
  ].filter(Boolean).join('\n\n');

  const effort = classifyEffort(model, userMessage, matchedRecipe, sessionWriteCount);

  return {
    dynamicSystemBlock,
    thinkingConfig: {
      type: 'adaptive',
      display: shouldShowThinking(toolCategories) ? 'summarized' : 'omitted',
    },
    outputConfig: { effort },
  };
}
```

### Token budget

| Component | Typical | Max |
|---|---|---|
| User Financial Profile | ~80 | ~150 |
| Episodic Memories (8 max) | ~120 | ~200 |
| Advice Context (5 max) | ~200 | ~300 |
| State Context | ~60 | ~200 |
| Proactiveness Instructions | ~200 | ~200 |
| Self-Evaluation Instructions | ~200 | ~200 |
| **Total** | **~860** | **~1,250** |

Within the ~2,000 token dynamic block budget from `spec/REASONING_ENGINE.md`.

---

## Settings > Memory page

F3 stores memories the user cannot see today. Before F3 ships, a Settings > Memory page must exist. This requires a new settings section scaffold — there is currently no `app/settings/` directory in Audric. Scope as a separate task alongside F3.

**Minimum viable page:**
- Lists all active `UserMemory` rows for the user with type, content, age
- Delete button per memory (hard-deletes both `content` and `originalQuote`)
- "Clear all" option
- Brief explanation: "These are things you've mentioned that Audric remembers to give you more relevant responses."

Route: `audric/apps/web/app/settings/memory/page.tsx` — requires new settings nav entry.

---

## UI requirements

> Text-level specs only — no wireframes at this stage. Wireframes should be created in a single session when Phase 3.5 implementation begins. These requirements ensure the intelligence features have the UI surfaces they need, and nothing gets designed in isolation.

### A. Thinking display — `ReasoningAccordion` component

**Ships with:** RE Phase 1 (task RE-1.4)

The reasoning engine streams `thinking_delta` events for financial decisions. The chat UI needs a component to show this.

- **Location:** Before the assistant's text response in the chat message list
- **Behaviour:** Collapsed by default. User expands to read. Collapses again on next message.
- **Label:** "How I evaluated this" for financial turns (`savings`, `credit`, `send` categories). Hidden entirely for service calls (`pay_api` for weather, images, etc.)
- **Styling:** `font-family: var(--font-mono)` (Departure Mono), smaller than body text (`text-xs`), `text-muted-foreground`. Should feel secondary — present but not competing with the response.
- **Content:** The summarised thinking output from the `thinking_delta` stream. Not the full chain-of-thought — the model's own summary (controlled by `display: 'summarized'` in the API call).
- **When hidden:** If `shouldShowThinking()` returns `false` (service calls, read-only queries), no accordion is rendered at all. No empty placeholder.

### B. Settings > Profile + Memory page

**Ships with:** Phase 2.5 (scaffold), F1 (profile data), F3 (memory data)

Users must be able to see what Audric knows about them. This is a trust surface for a financial app.

- **Route:** `audric/apps/web/app/settings/profile/page.tsx` (or combined into existing settings)
- **Profile section (F1):**
  - Shows inferred profile fields: risk appetite, financial literacy, currency preference, brief-response preference
  - Each field shows the inferred value + confidence level (e.g. "Risk appetite: Moderate (high confidence)")
  - "This doesn't seem right" link per field — opens a simple correction UI (radio buttons matching the enum values). Correction writes directly to `UserFinancialProfile` with `confidence: 1.0` (user-confirmed overrides inference)
  - Explanation text: "Audric infers these from your conversations. You can correct anything that's wrong."
- **Memory section (F3):**
  - Lists all active `UserMemory` rows: type badge, content, age ("3 days ago")
  - Delete button per memory (hard-deletes `content` + `originalQuote`)
  - "Clear all memories" button with confirmation dialog
  - Explanation text: "These are things you've mentioned that Audric remembers to give you more relevant responses."
- **Empty states:** Before F1 ships: "Your profile will appear here after a few conversations." Before F3 ships: "Memory will be available in a future update."

### C. State machine progress indicator

**Ships with:** F4 (Conversation State Machine)

When the engine is mid-recipe, the user needs a visual signal.

- **Location:** Persistent bar or badge at the top of the chat area, below the nav bar
- **Content:** Recipe name + step progress: "Rebalancing portfolio — step 2 of 4"
- **Actions:** "Cancel" button to reset state to idle
- **Behaviour:** Appears when `ConversationState.type === 'mid_recipe'`. Disappears on `idle`, `post_error`, or recipe completion. Animates in/out (slide down / fade).
- **For `awaiting_confirmation`:** Shows the proposed action with a countdown: "Confirm: Send $50 to Alice — expires in 3 min". Tapping it could scroll to the confirmation card in chat.
- **For `post_error`:** Show a muted error bar: "Last action failed — [action name]". Clears automatically on next successful action.
- **Styling:** Subtle, not alarming. Same treatment as the BriefingCard pinned bar — muted background, small text.

### D. Profile bootstrapping (onboarding addition)

**Ships with:** Phase 2.5 (task 2.5.6)

Optional step in the existing `/setup` wizard to seed the profile immediately.

- **Position:** After the allowance deposit step, before the final "You're all set" screen
- **Content:** "Tell us about your financial style" (optional, skip button visible)
  - Risk preference: 3 radio buttons — "Play it safe" / "Balanced" / "Growth-focused"
  - Goal text field: "What are you saving for?" (freeform, max 100 chars)
- **On submit:** Creates `UserFinancialProfile` with `riskAppetite` set, `riskConfidence: 0.8` (user-declared, not inferred — slightly below 1.0 to allow inference to refine later), and extracts the goal text into `primaryGoals`
- **On skip:** No profile created — inference starts from scratch after 5+ sessions

---

## Rollout sequencing

```
RE Phase 1 (Extended Thinking + maxTokens increase)
  ├── F2: Proactive Awareness     ← prompt addition only
  ├── F4: Conversation State      ← Redis + state transitions in chat + resume + hf-alert routes
  └── F5: Self-Evaluation         ← prompt addition only

RE Phase 2 (Guards)
  └── F1: User Financial Profile  ← Prisma migration + internal route + t2000 cron job

RE Phase 3 (Recipes)
  └── F3: Episodic Memory         ← Prisma migration + internal route + t2000 cron job + Settings > Memory page
```

---

## Implementation tasks

### F1: User Financial Profile

| Task | File | Effort |
|---|---|---|
| `UserFinancialProfile` Prisma migration + `User` back-relation | `audric/apps/web/prisma/schema.prisma` | S |
| `/api/internal/profile-inference` route | `audric/apps/web/app/api/internal/profile-inference/route.ts` | M |
| `buildInferencePrompt()` + `parseProfileUpdate()` | same | M |
| `buildProfileContext(profile)` — takes object, no DB query | `audric/apps/web/lib/engine-context.ts` | S |
| `profile-inference.ts` cron job | `t2000/apps/server/src/cron/jobs/profile-inference.ts` | S |
| Wire to daily EventBridge cron | `t2000/apps/server/src/cron/index.ts` | S |
| Tests: inference produces correct field updates | `__tests__/profile.test.ts` | M |
| Tests: low-confidence fields not injected | same | S |
| Tests: null fields skipped | same | S |
| Tests: prose filter removes JSON blobs | same | S |

**Estimated effort:** 2 days

### F2: In-Session Proactive Awareness

| Task | File | Effort |
|---|---|---|
| `buildProactivenessInstructions(profile)` | `audric/apps/web/lib/engine-context.ts` | S |
| Integration test: observation appears after relevant action | `__tests__/proactive.test.ts` | M |
| Integration test: no observation when nothing relevant | same | S |
| Integration test: brief-preference user gets suppressed observations | same | S |

**Estimated effort:** 0.5 days

### F3: Episodic User Memory

| Task | File | Effort |
|---|---|---|
| `UserMemory` Prisma migration + `User` back-relation | `audric/apps/web/prisma/schema.prisma` | S |
| `/api/internal/memory-extraction` route | `audric/apps/web/app/api/internal/memory-extraction/route.ts` | M |
| `buildExtractionPrompt()` + `parseMemories()` + `jaccardSimilarity()` | same | M |
| `buildMemoryContext(userId)` | `audric/apps/web/lib/engine-context.ts` | S |
| `memory-extraction.ts` cron job | `t2000/apps/server/src/cron/jobs/memory-extraction.ts` | S |
| Wire to daily cron | `t2000/apps/server/src/cron/index.ts` | S |
| Settings > Memory page scaffold + nav entry | `audric/apps/web/app/settings/memory/page.tsx` | M |
| Tests: explicit statements extracted | `__tests__/memory.test.ts` | M |
| Tests: inferences not extracted | same | S |
| Tests: cursor prevents re-processing old logs | same | S |
| Tests: Jaccard dedup blocks near-duplicates | same | S |
| Tests: expired memories not injected | same | S |
| Tests: hard-delete clears originalQuote | same | S |

**Estimated effort:** 2.5 days

### F4: Conversation State Machine

| Task | File | Effort |
|---|---|---|
| `ConversationState` + `StateTransition` types | `packages/engine/src/types/conversation-state.ts` | S |
| `ConversationStateManager` (Upstash `set({ ex })` API) | `packages/engine/src/state/conversation-state.ts` | M |
| `buildStateContext()` | `audric/apps/web/lib/engine-context.ts` | M |
| State transitions in chat route (recipe, error, success recovery) | `audric/apps/web/app/api/engine/chat/route.ts` | M |
| State transitions in resume route (confirmed / declined) | `audric/apps/web/app/api/engine/resume/route.ts` | M |
| HF alert state write in internal route | `audric/apps/web/app/api/internal/hf-alert/route.ts` | S |
| `completedStepOutputs` — key values only, not full payloads | `packages/engine/src/engine.ts` | S |
| Tests: mid-recipe state persists across turns | `__tests__/state.test.ts` | M |
| Tests: interrupted recipe resumes | same | M |
| Tests: expired confirmation handled gracefully | same | S |
| Tests: post-error clears on next success | same | S |
| Tests: HF state set by internal route, read by chat route | same | S |
| Tests: Upstash `set({ ex })` called correctly — not `setex` | same | S |

**Estimated effort:** 2 days

### F5: Post-Action Self-Evaluation

| Task | File | Effort |
|---|---|---|
| `buildSelfEvaluationInstruction()` | `audric/apps/web/lib/engine-context.ts` | S |
| Integration test: partial success described correctly | `__tests__/self-eval.test.ts` | M |
| Integration test: exact tool amounts quoted | same | S |
| Integration test: multi-part question answered fully | same | S |

**Estimated effort:** 0.5 days

### Unified context assembly

| Task | File | Effort |
|---|---|---|
| `buildFullDynamicContext(model, ...)` — `model` as explicit param | `audric/apps/web/lib/engine-context.ts` | M |
| Move `buildAdviceContext` from `engine-factory.ts` → `engine-context.ts`, export it | `audric/apps/web/lib/engine-context.ts` | S |
| Single profile fetch passed to both F1 + F2 functions | same | S |
| Wire to chat route, replace existing context building | `audric/apps/web/app/api/engine/chat/route.ts` | S |
| Token budget test: dynamic block < 1,250 tokens | `__tests__/context.test.ts` | S |
| All context queries run concurrently via `Promise.all` | same | S |

**Estimated effort:** 0.5 days

---

## Total effort estimate

| Feature | Effort |
|---|---|
| F1: User Financial Profile | 2 days |
| F2: Proactive Awareness | 0.5 days |
| F3: Episodic Memory | 2.5 days |
| F4: State Machine | 2 days |
| F5: Self-Evaluation | 0.5 days |
| Unified context assembly | 0.5 days |
| **Total** | **~8 days** |

---

## Validation criteria

| Feature | Scenario | Pass criteria |
|---|---|---|
| **F1** | Advanced user asks about health factor | No explainer — answers directly |
| **F1** | Novice borrows | Plain-English explanation included |
| **F1** | Fiat-framing user checks balance | Shows "$500" not "500 USDC" |
| **F1** | User with stated goal deposits | Goal progress mentioned unprompted |
| **F1** | Inference on <5 turns | Skipped — no update written |
| **F2** | Swap, savings goal behind | Single-sentence observation after result |
| **F2** | Repays debt, HF now safe | No extra observation |
| **F2** | Brief-preference user swaps | Observation suppressed |
| **F3** | User mentions rent date; next session | Audric references when balance-relevant |
| **F3** | Memory expires | Not injected after expiry |
| **F3** | Same fact in two consecutive runs | Jaccard dedup prevents duplicate |
| **F3** | User visits Settings > Memory | Sees all memories, can delete each |
| **F4** | Mid-recipe, unrelated question | Answers briefly, offers to resume |
| **F4** | Confirmation sent, user says "yes" | Executes, resets to idle |
| **F4** | Confirmation expires | Surfaces expiry on next message |
| **F4** | Tool fails mid-recipe | post_error state set, described clearly |
| **F4** | Next successful action after error | post_error clears automatically |
| **F4** | HF alert fires externally | State set in hf-alert route, read on next chat turn |
| **F5** | Swap ok, deposit fails | Both outcomes described accurately |
| **F5** | Deposit with protocol fee | Exact received amount from tool result quoted |
| **F5** | Two-part question | Both parts answered |

---

## Resolved decisions

| Question | Decision |
|---|---|
| Profile inference: explicit or inferred? | Inferred from behaviour — no user-facing form |
| Profile DB query: once or twice? | Once in `buildFullDynamicContext`, passed to both F1 and F2 |
| Memory dedup: external library or inline? | Inline Jaccard coefficient — no dependency needed |
| Memory cursor: fixed window or timestamp cursor? | `lastInferredAt` cursor on `UserFinancialProfile` for F1; F3 uses `MAX(extractedAt)` from `UserMemory` — prevents re-processing same turns |
| State machine storage: Redis or Prisma? | Redis (session-scoped, 1h TTL). No Prisma for state — it's ephemeral. |
| HF alert state transition: chat route or hf-alert route? | hf-alert internal route — that's where the external trigger originates |
| `completedStepOutputs`: full payload or key values? | Key values only (amounts, IDs, status) — prevents context bloat |
| Settings > Memory: when? | Ships with F3, as a prerequisite, not a follow-on |

## Open questions

1. **Profile inference cadence at scale:** Daily for all users is fine initially. At 10,000+ users, restrict to users active in the last 7 days. No architectural change needed — just a `where` clause addition.

2. **Memory conflict handling:** A user says "I'm saving aggressively" in session 1 and "I need to be cautious" in session 3. Both get extracted. The engine sees both and must reason about recency. Initial approach: include age in the memory context string (already implemented — `3d ago`). Monitor for user confusion before building conflict resolution.

3. **Profile bootstrapping for new users:** Confidence stays below injection threshold (0.3) for first ~10 sessions. Consider an optional "tell us your goals" prompt on first session to seed the profile faster — not required for launch.

4. **State machine and 1h TTL:** A user starts a rebalance, closes the app, and returns 90 minutes later. State is gone — graceful fallback to `idle`. This is correct behaviour. If the user says "continue the rebalance" with no state, the engine should ask them to re-initiate rather than guessing. No code change needed, but worth a test case.

5. **`shouldShowThinking` and financial tool categories:** The function checks `['savings', 'credit', 'send', 'swap']`. The swap category name should be verified against the actual tool category enum in `@t2000/engine` once reasoning engine tooling decisions are finalised. Cross-reference `spec/REASONING_ENGINE.md` tool flag definitions.

---

## References

- `spec/REASONING_ENGINE.md` — Extended thinking, adaptive effort, `output_config`, prompt caching, context compaction, `classifyEffort()`, `shouldShowThinking()`, tool flag definitions
- `audric-feedback-loop-spec.md` — `AdviceLog`, `buildAdviceContext()`, `ConversationLog` schema, ECS cron pattern
- `audric-roadmap.md` — Phase 1.1 (t2000/Audric cron split, `AUDRIC_INTERNAL_KEY`, internal API pattern), Phase 0.1 (`ConversationLog` schema), Phase 0.3 (`User` table)
- [Anthropic Adaptive Thinking](https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking)
- [Anthropic Effort Parameter](https://platform.claude.com/docs/en/build-with-claude/effort)

---

*audric.ai | t2000.ai | mpp.t2000.ai | April 2026 | Confidential*
