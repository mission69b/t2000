# v3 Build Plan

> Concrete implementation plan for T2000_V3_SPEC.md. Maps spec sections to code changes, ordered by dependency.
>
> **Status:** ✅ Shipped — Phases 1–12 complete. POL-15 (invest earn/unearn) remains as placeholder.

**Starting point:** `apps/web` is the marketing site (t2000.ai). The v3 web app is a new Next.js app at `apps/web-app`. The SDK (`packages/sdk`) is Node-first with Ed25519Keypair hardcoded — needs a pluggable signer and browser build.

---

## Phase 1: SDK Foundation (Week 1) ✅

The web app can't exist without a browser-compatible SDK. This is the critical path.

### 1.1 — Pluggable Signer Interface ✅

**Problem:** `executeWithGas()` in `packages/sdk/src/gas/manager.ts` takes `Ed25519Keypair` directly. `T2000` class stores `this.keypair: Ed25519Keypair`. zkLogin needs a different signing mechanism.

**Changes:**

```
packages/sdk/src/signer.ts (NEW)
```

```typescript
export interface TransactionSigner {
  getAddress(): string;
  signTransaction(txBytes: Uint8Array): Promise<{ signature: string }>;
}
```

This is the minimum contract. Both Ed25519 and zkLogin can satisfy it.

```
packages/sdk/src/wallet/keypairSigner.ts (NEW)
```

Wraps `Ed25519Keypair` to implement `TransactionSigner`:

```typescript
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import type { TransactionSigner } from '../signer.js';

export class KeypairSigner implements TransactionSigner {
  constructor(private keypair: Ed25519Keypair) {}
  getAddress(): string { return this.keypair.toSuiAddress(); }
  async signTransaction(txBytes: Uint8Array): Promise<{ signature: string }> {
    return { signature: (await this.keypair.signTransaction(txBytes)).signature };
  }
}
```

**Update these files to use `TransactionSigner` instead of `Ed25519Keypair`:**

| File | Change |
|------|--------|
| `gas/manager.ts` | `executeWithGas(client, signer: TransactionSigner, ...)` |
| `gas/gasStation.ts` | Replace `Buffer` with `Uint8Array` + base64 util |
| `t2000.ts` | Store `signer: TransactionSigner` alongside keypair. Add `T2000.fromZkLogin({ jwt, salt, ephemeralKey, proof })` static factory. |

**Backward compatibility:** `T2000.create()` still works — it creates a `KeypairSigner` internally. Existing CLI/MCP code doesn't change.

### 1.2 — ZkLoginSigner ✅

```
packages/sdk/src/wallet/zkLoginSigner.ts (NEW)
```

```typescript
import type { TransactionSigner } from '../signer.js';

export class ZkLoginSigner implements TransactionSigner {
  constructor(
    private ephemeralKeypair: Ed25519Keypair,
    private zkProof: ZkLoginProof,
    private userAddress: string,
    private maxEpoch: number,
  ) {}

  getAddress(): string { return this.userAddress; }

  async signTransaction(txBytes: Uint8Array): Promise<{ signature: string }> {
    const ephSig = await this.ephemeralKeypair.signTransaction(txBytes);
    return {
      signature: getZkLoginSignature({
        inputs: this.zkProof,
        maxEpoch: this.maxEpoch,
        userSignature: ephSig.signature,
      }),
    };
  }

  isExpired(currentEpoch: number): boolean {
    return currentEpoch >= this.maxEpoch;
  }
}
```

### 1.3 — Browser Build Entry Point ✅

```
packages/sdk/src/browser.ts (NEW)
```

Exports everything EXCEPT Node-only modules (`keyManager.ts`, file-based contacts, portfolio persistence):

```typescript
export { ZkLoginSigner } from './wallet/zkLoginSigner.js';
export { KeypairSigner } from './wallet/keypairSigner.js';
export type { TransactionSigner } from './signer.js';
export { T2000Error, mapWalletError, mapMoveAbortCode } from './errors.js';
export { executeWithGas, getGasStatus } from './gas/index.js';
export { MIST_PER_SUI, SUPPORTED_ASSETS, ... } from './constants.js';
export { validateAddress, truncateAddress, ... } from './utils.js';
// Adapters loaded via dynamic import() — not statically bundled (bundle size)
// NO: keyManager, ContactManager (file-based), PortfolioManager (file-based)
```

**tsup.config.ts** update:

```typescript
entry: ['src/index.ts', 'src/adapters/index.ts', 'src/browser.ts'],
```

**package.json** update:

```json
"exports": {
  ".": { "types": "...", "import": "...", "require": "..." },
  "./browser": { "types": "./dist/browser.d.ts", "import": "./dist/browser.js" },
  "./adapters": { ... }
}
```

### 1.4 — Buffer → Uint8Array ✅

`gasStation.ts` and `manager.ts` use `Buffer` for base64 encoding. Replace with:

```typescript
function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}
```

These work in both Node and browser. Small utility, no dependency needed.

### 1.5 — Validation ✅

```bash
# Existing tests still pass (backward compat)
pnpm --filter @t2000/sdk test

# Browser entry builds cleanly
pnpm --filter @t2000/sdk build
# Verify dist/browser.js has no 'node:' imports
grep -r "node:" dist/browser.js  # should be empty

# Type check
pnpm --filter @t2000/sdk typecheck
```

---

## Phase 2: Server Additions (Week 1) ✅

### 2.1 — Salt Service Endpoint ✅

```
apps/server/src/routes/zklogin.ts (NEW)
```

```typescript
// POST /api/zklogin/salt
// Auth: Bearer JWT (Google ID token)
// Body: { jwt: string }
// Returns: { salt: string }
//
// Derives a unique, deterministic salt from the user's Google `sub`
// using HMAC-SHA256 with the master seed.
// The salt + sub + aud → deterministic Sui address.
```

**Environment variable:** `ZKLOGIN_MASTER_SEED` (256-bit hex). Must be set in production. AWS KMS in the future.

**Security:**
- Validate the JWT signature against Google's public keys (fetch from `https://www.googleapis.com/oauth2/v3/certs`)
- Rate limit: 10 requests/minute per IP
- Only return salt for the `sub` in the JWT (can't request other users' salts)

### 2.2 — User Preferences Endpoint ✅

```
apps/server/src/routes/preferences.ts (NEW)
```

```typescript
// GET  /api/user/preferences?address=0x...
// POST /api/user/preferences
// Body: { address, contacts?, limits? }
//
// Simple key-value store keyed by Sui address.
// Auth: signed message proving address ownership.
```

**Prisma schema addition (apps/server):**

```prisma
model UserPreferences {
  address   String   @id
  contacts  Json     @default("[]")
  limits    Json?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model LlmUsage {
  address String
  date    DateTime @db.Date
  count   Int      @default(0)
  @@id([address, date])
}
```

### 2.3 — Validation ✅

```bash
# Server builds and starts
pnpm --filter @t2000/server build
pnpm --filter @t2000/server dev

# Salt endpoint returns salt for valid JWT
curl -X POST http://localhost:3001/api/zklogin/salt \
  -H "Authorization: Bearer <google-jwt>" \
  -d '{"jwt":"<google-jwt>"}'

# Preferences CRUD works
curl http://localhost:3001/api/user/preferences?address=0x...
```

---

## Phase 3: Web App Scaffold (Week 2) ✅

### 3.1 — Create the App ✅

```bash
cd apps
pnpm create next-app web-app --typescript --tailwind --app --no-src-dir
```

**Key dependencies:**

```bash
pnpm --filter @t2000/web-app add \
  @mysten/sui \
  @mysten/dapp-kit \
  @mysten/zklogin \
  @tanstack/react-query \
  @t2000/sdk
```

**Dev dependencies:**

```bash
pnpm --filter @t2000/web-app add -D \
  @tailwindcss/postcss tailwindcss typescript \
  @types/react @types/react-dom
```

### 3.2 — Directory Structure ✅

```
apps/web-app/
├── app/
│   ├── layout.tsx              # Root layout: providers, fonts, metadata
│   ├── page.tsx                # Landing page (marketing → sign in CTA)
│   ├── dashboard/
│   │   └── page.tsx            # Conversational dashboard (authenticated)
│   ├── auth/
│   │   └── callback/
│   │       └── page.tsx        # Google OAuth redirect handler → extract JWT → ZK proof → /dashboard
│   ├── api/
│   │   └── zklogin/
│   │       └── salt/route.ts   # Proxy to server salt endpoint (or direct)
│   ├── globals.css
│   └── not-found.tsx
├── components/
│   ├── providers/
│   │   └── AppProviders.tsx    # QueryClient + SuiClient (no WalletProvider — zkLogin only)
│   ├── auth/
│   │   ├── GoogleSignIn.tsx    # Google OAuth button
│   │   ├── useZkLogin.ts       # Hook: manages session, ephemeral key, ZK proof
│   │   └── AuthGuard.tsx       # Redirects to landing if no session
│   ├── dashboard/
│   │   ├── BalanceHeader.tsx   # Balance + rewards display
│   │   ├── SmartCard.tsx       # Generic smart card component
│   │   ├── SmartCardFeed.tsx   # Renders 0-N smart cards based on account state
│   │   ├── ChipBar.tsx         # Bottom-pinned suggestion chips
│   │   ├── InputBar.tsx        # Text input (power-user shortcut)
│   │   ├── ConfirmationCard.tsx # Amount + fee + outcome → Confirm/Cancel
│   │   ├── ResultCard.tsx      # Success/error result in feed
│   │   └── SkeletonCard.tsx    # Loading placeholder
│   ├── settings/
│   │   └── SettingsPanel.tsx   # Slide-over settings panel
│   ├── services/
│   │   ├── ServicesPanel.tsx   # Browsable services grid
│   │   ├── ServiceCard.tsx     # Individual service/brand card
│   │   └── SmartForm.tsx       # Auto-generated form from API schema
│   └── ui/                     # shadcn/ui primitives (button, input, sheet, etc.)
├── hooks/
│   ├── useAgent.ts             # T2000.fromZkLogin() → full agent instance (save, send, etc.)
│   ├── useSmartCards.ts        # Polls t2000_overview, derives which cards to show
│   ├── useChipFlow.ts          # State machine for chip → sub-chip → confirmation
│   ├── useIntentParser.ts      # Client-side regex/fuzzy command parser
│   └── useLlm.ts              # LLM query hook (sends to MPP gateway)
├── lib/
│   ├── intent-parser.ts        # Pure function: string → parsed intent or null
│   ├── smart-cards.ts          # Pure function: account state → which cards to show
│   ├── zklogin.ts              # ZK proof generation, session storage, key management
│   └── constants.ts            # Network config, Google Client ID, etc.
├── public/
├── next.config.ts
├── package.json
├── tsconfig.json
└── tailwind.config.ts
```

### 3.3 — Providers Setup ✅

```
components/providers/AppProviders.tsx
```

```typescript
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SuiClientProvider, createNetworkConfig } from '@mysten/dapp-kit';
import '@mysten/dapp-kit/dist/index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
});

const { networkConfig } = createNetworkConfig({
  testnet: { url: getFullnodeUrl('testnet') },
  mainnet: { url: getFullnodeUrl('mainnet') },
});

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
        {children}
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
```

No `WalletProvider` — we don't use dApp Kit's wallet adapter. zkLogin is handled manually.

### 3.4 — Landing Page ✅

Static marketing page with Google Sign-In CTA. Spec Section: "Screen 1: Landing." Content is mostly static — no API calls needed.

### 3.5 — Loading Screen ✅

```
components/auth/LoadingScreen.tsx
```

Progress steps shown during ZK proof generation (3-8 seconds):
1. "Account created" — checkmark after JWT received
2. "Address generated" — checkmark after salt received from server
3. "Securing your account" — spinner during ZK proof, then checkmark

Progress bar at the bottom. This covers the one awkward pause in the onboarding flow.

### 3.6 — Google OAuth Flow ✅

```
components/auth/useZkLogin.ts
```

Core hook that manages the full zkLogin lifecycle:

1. Generate ephemeral keypair → store in `localStorage`
2. Compute nonce from keypair + maxEpoch
3. Redirect to Google OAuth with nonce
4. On callback: extract JWT, call salt service, generate ZK proof
5. Construct `ZkLoginSigner` from `@t2000/sdk/browser`
6. Store session in `localStorage` (ephemeral key + proof + maxEpoch)
7. On subsequent visits: restore session from storage, check expiry

**State machine:**

```
idle → redirecting → proving → ready
                                 ↓
                            expired → idle
```

### 3.7 — Vercel Deployment Config ✅

Configure Vercel project for `apps/web-app`:
- Root directory: `apps/web-app`
- Build command: `pnpm --filter @t2000/web-app build`
- Framework: Next.js
- Domain: `app.t2000.ai`
- Environment variables: `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_SUI_NETWORK`

### 3.8 — Validation ✅

```bash
pnpm --filter @t2000/web-app dev --turbo
# Landing page renders
# Google sign-in redirects to OAuth
# Loading screen shows progress steps
# After OAuth + ZK proof, dashboard loads with balance
```

---

## Phase 4: Core Dashboard (Week 3) ✅

### 4.1 — Balance Header ✅

```
components/dashboard/BalanceHeader.tsx
```

Displays checking balance, savings, rewards. Polls via `useSuiClientQuery` or a custom hook that calls the SDK.

**Data source:** Direct RPC via `@mysten/sui` client — `getBalance`, `getOwnedObjects` for positions. Or: build a thin `useAccountOverview()` hook that mirrors what `t2000_overview` does in the MCP server.

### 4.2 — Smart Cards Feed ✅

```
hooks/useSmartCards.ts
```

Pure logic: takes account state → returns array of `SmartCardData[]`. Each card has: type, title, body, action chips, MCP tool reference.

```
components/dashboard/SmartCardFeed.tsx
```

Maps `SmartCardData[]` → `<SmartCard />` components. Handles empty state ("Your account is working for you").

### 4.3 — Chip Bar + Input ✅

```
components/dashboard/ChipBar.tsx
```

Renders `[Save] [Send] [Services] [More...]`. Tapping a chip triggers `useChipFlow` state machine.

```
hooks/useChipFlow.ts
```

State machine for multi-step chip flows:

```
L1 chip tapped (e.g., Save)
  → show L2 chips (amount: $100, $500, Custom)
  → amount selected
  → dry-run SDK call
  → show ConfirmationCard with real numbers
  → user confirms
  → execute transaction
  → show ResultCard
  → reset to L1 chips
```

### 4.4 — Confirmation Card Pattern ✅

```
components/dashboard/ConfirmationCard.tsx
```

One reusable component for every action. Props: `title`, `details[]`, `onConfirm`, `onCancel`. Always shows real numbers from dry-run.

### 4.5 — Settings Slide-over ✅

```
components/settings/SettingsPanel.tsx
```

Uses shadcn `Sheet` component. Shows account, session, contacts, safety limits, Suiscan link, emergency lock, sign out.

### 4.6 — Core Chip Flows ✅

Build these 4 flows — they all use the same pattern (chip → sub-chips → dry-run → confirm → execute → result):

| Flow | SDK method | Key params |
|------|-----------|------------|
| Save | `agent.save(amount)` | amount, protocol (auto-selected best rate) |
| Send | `agent.send(to, amount)` | recipient (contact or address), amount |
| Withdraw | `agent.withdraw(amount)` | amount |
| Borrow | `agent.borrow(amount)` | amount |
| Repay | `agent.repay(amount)` | amount (under [More...]) |

### 4.7 — Save as Contact Toast ✅

After a successful Send to a new address, show a toast: "Name this address?" with a text input. On submit, save the contact via `POST /api/user/preferences`. Next time the user taps [Send], the new contact appears as a chip.

**Implementation:**
- `components/dashboard/ContactToast.tsx` — animated toast with expand-to-name-input flow
- `hooks/useContacts.ts` — loads contacts from `/api/user/preferences`, provides `addContact`, `isKnownAddress`, `resolveContact`
- Dashboard wires `contact-prompt` feed item after successful Send to unknown address
- Send flow shows saved contacts as chips above the address input, supports name resolution

### 4.8 — Validation ✅

```bash
# Dashboard renders with real balance
# Tapping Save → $100 → shows confirmation with real numbers
# Confirming executes transaction, result appears in feed
# Smart cards appear based on account state
# Settings panel opens and shows correct info
```

---

## Phase 5: Smart Cards + LLM (Week 4) ✅

### 5.1 — Smart Cards with Actions ✅

Wire up the action chips on smart cards to real SDK calls:

| Card | Action | SDK call |
|------|--------|---------|
| 🏆 Rewards | [Claim $12.40] | `agent.claimRewards()` |
| 💰 Idle funds | [Move to savings] | `agent.save(idleAmount)` |
| 📈 Better rate | [Switch] | `agent.rebalance(targetProtocol)` |
| ⚠ Risk | [Repay $50] | `agent.repay(50)` |
| ⚠ Session | [Refresh] | Re-trigger zkLogin flow |

### 5.2 — Client-Side Intent Parser ✅

```
lib/intent-parser.ts
```

Regex + fuzzy matching for typed commands:

```typescript
type ParsedIntent =
  | { action: 'save'; amount: number }
  | { action: 'send'; to: string; amount: number }
  | { action: 'withdraw'; amount: number }
  | { action: 'borrow'; amount: number }
  | { action: 'report' }
  | { action: 'history' }
  | { action: 'address' }
  | null; // → falls through to LLM

export function parseIntent(input: string): ParsedIntent { ... }
```

Handles: "save 500", "send $50 to mom", "my address", "history", "report", "balance", "withdraw all", etc. Returns `null` for anything it can't parse → triggers LLM.

### 5.3 — LLM Integration ✅ (scaffolded — MPP endpoint TBD)

```
hooks/useLlm.ts
```

Sends user message to an LLM endpoint (via MPP gateway — dogfooding). The LLM has tool definitions matching the 35 MCP tools. When the LLM calls a tool, the web app executes it and renders the result.

**Flow:**

```
User types freeform message
  → POST to LLM (via MPP)
  → LLM responds with text OR tool_call
  → If tool_call: execute SDK method, show confirmation card
  → If text: render as chat bubble in feed
```

**LLM endpoint:** `POST /v1/chat/completions` via MPP gateway. Model: `gpt-4o-mini` or Claude Haiku. System prompt includes tool definitions derived from MCP tool schemas.

### 5.4 — Response Renderers ✅

Different result types need different renderers:

| Type | Renderer | Example |
|------|----------|---------|
| Text | Chat bubble | "Your savings are earning 6.8%" |
| Confirmation | ConfirmationCard | Save $500 confirmation |
| Receipt | ReceiptCard | Gift card code, transaction link |
| Image | ImageCard | Generated image from fal.ai |
| List | ListCard | Transaction history |
| Report | ReportCard | Financial summary |
| Audio | AudioCard | TTS output, inline player + download |

### 5.5 — Validation ✅

```bash
# Type "save 500" → parsed client-side → confirmation card (no LLM)
# Type "what should I do with $500?" → LLM responds with recommendation
# Smart card actions execute real transactions
# LLM tool calls show confirmation cards before executing
```

---

## Phase 6: Services + Polish (Week 5) ✅

### 6.1 — Services Panel ✅

```
components/services/ServicesPanel.tsx
```

Slides up from [Services] chip. Shows category chips at top, then a grid of brand/service cards.

**Data source:** Static JSON file mapping MPP services to display metadata (name, icon, category, description). No API call needed — the service catalog is known at build time.

**Categories:** Gift Cards, AI, Search & Tools, Communication, Media, Finance.

### 6.2 — Smart Forms ✅

```
components/services/SmartForm.tsx
```

When a service is selected, renders a form based on the API's parameter schema. For gift cards: amount + email. For image gen: prompt text. For flights: origin + destination + date.

Each form field has a label, placeholder, and validation. Submit triggers a confirmation card with the total cost.

### 6.3 — Remaining Chip Flows ✅

Build these using the same pattern as Phase 4:

| Flow | SDK method | Notes |
|------|-----------|-------|
| Invest | `agent.invest(asset, amount)` | Asset chips: SUI, BTC, ETH, GOLD |
| Swap/Exchange | `agent.exchange(from, to, amount)` | Token chips → amount |
| Report | Read-only: `t2000_overview` → render ReportCard | Instant, no confirmation |
| History | Read-only: `t2000_history` → render ListCard | Inline transaction list |
| Receive | Show address + QR code | Uses `qrcode` npm package |
| Rates | Read-only: `t2000_all_rates` → current vs. best | With [Switch] action |
| Help | Static feature overview | No API call, just formatted content |

### 6.4 — Error States ✅

Implement the error card pattern from the spec. Map Move abort codes to human-readable messages. Show actionable chips on every error.

### 6.5 — Mobile Responsive Pass ✅

- Balance header scales down cleanly
- Smart cards stack vertically, full-width on mobile
- Chip bar doesn't overflow (4 chips max on mobile)
- Services panel is full-screen on mobile
- Settings panel is full-screen on mobile
- Text input has proper mobile keyboard handling

### 6.6 — LLM Rate Limit UX ✅

Track daily query count via `llm_usage` table. Show inline cost warning at 11th query. Display small cost badge after that.

### 6.7 — Beta Test ⏳ (blocked on P1-P3)

Deploy to Vercel. Share with 5-10 users. Collect feedback on:
- Onboarding flow (Google sign-in → dashboard)
- Smart cards (are they helpful or noisy?)
- Chip flows (can users complete Save, Send without confusion?)
- Services (can users buy a gift card end-to-end?)
- Mobile experience

---

## Dependency Graph

```
Week 1 ─┬─ SDK: Signer interface + KeypairSigner + ZkLoginSigner
         │  SDK: T2000.fromZkLogin() factory + browser entry (no node: imports)
         │  SDK: Buffer → Uint8Array, dynamic adapter imports
         │
         ├─ Server: Salt endpoint + JWT validation
         │  Server: Preferences endpoint + DB migration (UserPreferences, LlmUsage)
         │
Week 2 ──┤  Web app scaffold (depends on SDK browser build)
         │  Landing page + loading screen (progress steps)
         │  Google OAuth flow + zkLogin session management
         │  Vercel deployment config (app.t2000.ai)
         │
Week 3 ──┤  Dashboard layout (depends on zkLogin working)
         │  Balance header + smart cards feed
         │  Chip bar + chip flow state machine
         │  Confirmation card pattern + dry-run
         │  Core flows: Save, Send, Withdraw, Borrow
         │  Save-as-contact toast (after Send)
         │  Settings panel
         │
Week 4 ──┤  Smart card actions (Claim, Sweep, Rebalance)
         │  Client-side intent parser
         │  LLM integration + tool calling
         │  Response renderers (text, image, receipt, list, report, audio)
         │
Week 5 ──┘  Services panel + smart forms
            Remaining flows: Invest, Swap, Report, History, Receive,
              Rates, Help
            QR code for Receive flow
            Error states + mobile pass + LLM rate limit
            Beta deploy
```

---

## File Change Summary

### New Files

| File | Phase | Purpose |
|------|-------|---------|
| `packages/sdk/src/signer.ts` | 1 | TransactionSigner interface |
| `packages/sdk/src/wallet/keypairSigner.ts` | 1 | Ed25519 adapter |
| `packages/sdk/src/wallet/zkLoginSigner.ts` | 1 | zkLogin adapter |
| `packages/sdk/src/browser.ts` | 1 | Browser-safe entry point |
| `apps/server/src/routes/zklogin.ts` | 2 | Salt service |
| `apps/server/src/routes/preferences.ts` | 2 | User preferences CRUD |
| `apps/web-app/` (entire directory) | 3-6 | New web application |

### Modified Files

| File | Phase | Change |
|------|-------|--------|
| `packages/sdk/src/gas/manager.ts` | 1 | `Ed25519Keypair` → `TransactionSigner` |
| `packages/sdk/src/gas/gasStation.ts` | 1 | `Buffer` → `Uint8Array` base64 |
| `packages/sdk/src/t2000.ts` | 1 | Add `signer` property alongside `keypair` |
| `packages/sdk/src/index.ts` | 1 | Export new signer types |
| `packages/sdk/tsup.config.ts` | 1 | Add `browser.ts` entry |
| `packages/sdk/package.json` | 1 | Add `./browser` export |
| `apps/server/src/index.ts` | 2 | Mount new routes |
| `apps/server/prisma/schema.prisma` | 2 | Add UserPreferences + LlmUsage models |
| `pnpm-workspace.yaml` | 3 | Add `apps/web-app` |

### New Test Files

| File | Phase | Coverage | Status |
|------|-------|----------|--------|
| `packages/sdk/src/wallet/keypairSigner.test.ts` | 1 | Signer interface contract (6 tests) | ✅ |
| `packages/sdk/src/wallet/zkLoginSigner.test.ts` | 1 | zkLogin signing + expiry (6 tests) | ✅ |
| `apps/server/src/routes/zklogin.test.ts` | 2 | Salt service (JWT validation, determinism, rate limit) | ⏳ |
| `apps/server/src/routes/preferences.test.ts` | 2 | Preferences CRUD | ⏳ |
| `apps/web-app/lib/intent-parser.test.ts` | 5 | All parse cases — 29 tests | ✅ |
| `apps/web-app/lib/smart-cards.test.ts` | 4 | Account state → card derivation — 15 tests | ✅ |
| `apps/web-app/hooks/useChipFlow.test.ts` | 4 | State machine transitions — 10 tests | ✅ |

### Not Changed

| File | Why |
|------|-----|
| `packages/cli/*` | CLI stays keypair-only, no changes |
| `packages/mcp/*` | MCP server unchanged — web app reuses same tool logic |
| `apps/web/*` | Marketing site unchanged |
| `apps/gateway/*` | MPP gateway unchanged — web app calls it as a client |

---

## Gaps Found (Spec ↔ Build Plan Cross-Reference)

These items are in the spec but were missing or under-specified in the build plan.

### Gap 1: `T2000.fromZkLogin()` static factory ✅

Implemented in Phase 1. `T2000.fromZkLogin()` factory added alongside `T2000.create()`. Browser entry point exports it.

### Gap 2: `useAgent.ts` hook ✅

Implemented in Phase 3. `useAgent()` lazily loads SDK via `getInstance()` → `T2000.fromZkLogin()`. Dashboard has TODO to wire actual SDK calls.

### Gap 3: QR code for [Receive] flow ✅

`qrcode` npm package installed. `components/dashboard/QrCode.tsx` renders address as scannable QR (white-on-transparent). Receipt feed items with `qr: true` display the QR code above the address. [Receive] chip and `address` intent both show QR + copyable address.

### Gap 4: Contact "Save as contact?" toast ✅

`components/dashboard/ContactToast.tsx` shows after successful Send to a new address. `hooks/useContacts.ts` manages contact state via `/api/user/preferences`. Saved contacts appear as chips in the Send flow.

### Gap 5: Dynamic imports for DeFi adapters ✅

`useAgent.ts` uses `import()` for lazy SDK loading. No static adapter imports in browser bundle.

### Gap 6: Loading screen with progress steps ✅

`components/auth/LoadingScreen.tsx` implemented with 3 progress steps + progress bar.

### Gap 7: `[Sentinels]` chip flow — Removed (POL-14)

Sui Sentinel integration was removed. See POL-14.

### Gap 8: `[Rates]` chip ✅

`[Rates]` is in ChipBar under `[More...]`. Currently renders AI text response; will wire to `t2000_all_rates` in Phase 6.

### Gap 9: `[Help]` chip ✅

`[Help]` chip implemented. Renders formatted feature list via intent parser and feed.

### Gap 10: Vercel deployment config ✅

Deployed to Vercel at `app.t2000.ai`. Enoki prover, Google OAuth, NeonDB all configured.

### Gap 11: OAuth callback route ✅

`app/auth/callback/page.tsx` implemented. Handles Google redirect, JWT extraction, ZK proof, and redirect to dashboard.

### Gap 12: `[Repay]` chip ✅

Repay added to core chip flows (Phase 4). Available under `[More...] → [Repay]`.

### Gap 13: CSP / Security headers ✅

`next.config.ts` configured with strict CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, and Permissions-Policy.

### Gap 14: Audio response renderer ✅

`AudioCard` in `FeedRenderer.tsx` with `<audio>` controls + download button.

---

## Phase 7: Design System Alignment ✅

The web app (`app.t2000.ai`) must visually match the gateway (`t2000.ai`). Currently the web app uses generic Tailwind neutrals + Inter, while the gateway has a distinct terminal-chic identity with semantic color tokens, IBM Plex Mono, noise texture, and mint accent. This phase brings the web app into visual parity.

**Principle:** The gateway's design DNA is the brand. The web app is a different product (consumer banking vs. developer tools) so it keeps Inter for body text readability, but adopts the same color palette, surface layering, border treatments, and motion language.

### 7.1 — Shared Design Tokens ✅

Migrate `globals.css` from generic Tailwind neutrals to the gateway's semantic color system.

**Changes — `apps/web-app/app/globals.css`:**

```css
:root {
  --background: #040406;
  --surface: #080a0f;
  --panel: #0d1018;
  --border: rgba(255, 255, 255, 0.07);
  --border-bright: rgba(255, 255, 255, 0.14);
  --foreground: #e8e6e0;
  --muted: #5a6070;
  --dim: #333844;
  --accent: #00d68f;
  --accent-dim: rgba(0, 214, 143, 0.12);
}
```

**@theme inline additions:**

```css
@theme inline {
  --color-surface: var(--surface);
  --color-panel: var(--panel);
  --color-muted: var(--muted);
  --color-dim: var(--dim);
  --color-accent: var(--accent);
  --color-accent-dim: var(--accent-dim);
  --color-border: var(--border);
  --color-border-bright: var(--border-bright);
}
```

**Reasoning:** Every card, input, and border in the web app currently uses ad-hoc `neutral-800`, `neutral-900`, etc. Migrating to semantic tokens means a single source of truth shared with the gateway.

### 7.2 — Typography ✅

Add IBM Plex Mono as a secondary font for code, addresses, and amounts. Keep Inter for body text.

**Changes — `apps/web-app/app/layout.tsx`:**

```typescript
import { Inter, IBM_Plex_Mono } from 'next/font/google';

const inter = Inter({ variable: '--font-inter', subsets: ['latin'] });
const ibmPlexMono = IBM_Plex_Mono({
  variable: '--font-ibm-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});
```

```html
<html className={`${inter.variable} ${ibmPlexMono.variable} ...`}>
```

**Usage rules:**
- `font-sans` (Inter) → body text, labels, descriptions
- `font-mono` (IBM Plex Mono) → addresses, amounts, transaction hashes, balances, code

**@theme update:**

```css
--font-mono: var(--font-ibm-plex-mono);
```

### 7.3 — Background & Texture ✅

Add the noise texture overlay from the gateway.

**Changes — `apps/web-app/app/globals.css`:**

```css
body::before {
  content: "";
  position: fixed;
  inset: 0;
  background-image: url("data:image/svg+xml,..."); /* same noise SVG as gateway */
  pointer-events: none;
  z-index: 1;
  opacity: 0.4;
}
```

**Also:** Change body background from `bg-neutral-950` to `bg-background` (maps to `#040406`).

### 7.4 — Component Reskin ✅

Systematically replace all ad-hoc neutral-* classes with semantic tokens. This is the bulk of the work.

**Files to update:**

| File | Key changes |
|------|-------------|
| `app/page.tsx` (landing) | `bg-neutral-950` → `bg-background`, text colors → `text-foreground`/`text-muted`, stats section styling |
| `app/dashboard/page.tsx` | Cards: `bg-neutral-900 border-neutral-800` → `bg-surface border-border`. Inputs: `bg-neutral-800` → `bg-panel`. Muted text: `text-neutral-400` → `text-muted`. Accent buttons: add `text-accent` / `bg-accent-dim` |
| `components/auth/GoogleSignIn.tsx` | Button reskin with border-border, hover states |
| `components/auth/AuthGuard.tsx` | Loading skeleton colors |
| `components/dashboard/FeedRenderer.tsx` | All feed card variants: receipts, errors, confirmations, AI responses |
| `components/dashboard/SmartCard.tsx` | Card chrome: surface → panel layering, accent CTA buttons |
| `components/dashboard/ChipBar.tsx` | Chip pills: `bg-neutral-800` → `bg-panel border border-border`, selected state → `bg-accent-dim border-accent/40 text-accent` |
| `components/dashboard/ContactToast.tsx` | Toast background, input styling |
| `components/dashboard/QrCode.tsx` | Background treatment |

**Token mapping cheat sheet:**

| Current | New |
|---------|-----|
| `bg-neutral-950` | `bg-background` |
| `bg-neutral-900` | `bg-surface` |
| `bg-neutral-800` | `bg-panel` |
| `border-neutral-800` | `border-border` |
| `border-neutral-700` | `border-border-bright` |
| `text-neutral-400` | `text-muted` |
| `text-neutral-500/600` | `text-dim` |
| `text-white` | `text-foreground` |
| `bg-white text-black` (CTA) | `bg-accent text-background` |
| `hover:bg-neutral-200` (CTA hover) | `hover:bg-accent/90` |

### 7.5 — Motion & Animations ✅

Port gateway animations and add new ones for the dashboard.

**Changes — `apps/web-app/app/globals.css`:**

```css
@keyframes feed-slide-in {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

.feed-row {
  animation: feed-slide-in 0.3s ease-out both;
}

@keyframes line-appear {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.scrollbar-none::-webkit-scrollbar { display: none; }
.scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
```

**Component animations:**
- Feed items get `feed-row` class for entrance animation
- Smart cards get staggered entrance (animation-delay per card)
- Chip bar horizontal scroll gets `scrollbar-none`

### 7.6 — Landing Page Alignment ✅

Align the landing page structure with the gateway's layout patterns.

**Changes:**
- Reduce hero heading from `text-5xl` to `text-2xl font-medium` (matches gateway's understated tone)
- Add `max-w-3xl mx-auto` container (matches gateway)
- Stats section: use `border border-border rounded-lg bg-surface/40` card treatment
- Footer: match gateway's border-t + muted text pattern
- CLI link: match gateway's `CopyInstall` component style

### 7.7 — Accent Color Integration ✅

The mint accent (`#00d68f`) should appear in key interaction points:

- Primary CTA buttons: `bg-accent text-background`
- Active/selected chips: `border-accent/40 bg-accent-dim text-accent`
- Success states (tx confirmed, reward claimed): green accent
- Links: `text-accent hover:underline`
- Smart card action buttons: accent-colored

**Neutral for destructive/warning:** Keep red for errors, amber for warnings.

### Implementation Order

| Step | Task | Est. |
|------|------|------|
| 7.1 | Design tokens in globals.css + @theme | 15 min |
| 7.2 | Typography (add IBM Plex Mono) | 10 min |
| 7.3 | Noise texture + background | 5 min |
| 7.5 | Animations in globals.css | 10 min |
| 7.4 | Component reskin (bulk work) | 60-90 min |
| 7.6 | Landing page alignment | 20 min |
| 7.7 | Accent color pass | 15 min |
| — | Visual QA (browser test all screens) | 20 min |

**Total estimate:** ~3 hours

---

## Testing & Documentation

### Test Coverage

The existing codebase has solid test coverage:
- **SDK:** 27 test files (unit + integration + smoke)
- **Server:** 1 test file (API routes)
- **MCP:** 9 test files (tools, prompts, safety)

v3 needs tests for the new code. Here's the testing plan per phase:

#### Phase 1 — SDK Tests (Week 1)

| File | Tests |
|------|-------|
| `signer.test.ts` | `TransactionSigner` interface contract |
| `keypairSigner.test.ts` | `getAddress()`, `signTransaction()`, backward compat with `Ed25519Keypair` |
| `zkLoginSigner.test.ts` | `getAddress()`, `signTransaction()` with mock ZK proof, `isExpired()` |
| `gas/manager.test.ts` | **Update existing** — verify `executeWithGas` works with `TransactionSigner` (not just `Ed25519Keypair`) |
| `gas/gasStation.test.ts` | **Update existing** — verify `Buffer` → `Uint8Array` doesn't break serialization |
| `browser.test.ts` | Import test — verify `browser.ts` builds without `node:` imports |

Run: `pnpm --filter @t2000/sdk test` — all existing 27 test files must still pass.

#### Phase 2 — Server Tests (Week 1)

| File | Tests |
|------|-------|
| `routes/zklogin.test.ts` | Valid JWT → returns salt. Invalid JWT → 401. Rate limit → 429. Same sub → same salt (deterministic). |
| `routes/preferences.test.ts` | GET → returns contacts/limits. POST → upserts. Invalid address → 400. |

Run: `pnpm --filter @t2000/server test`

#### Phase 3-5 — Web App Tests (Weeks 2-4)

| File | Tests |
|------|-------|
| `lib/intent-parser.test.ts` | All parse cases from spec table (line 1170-1182): "save 500", "send $50 to 0x...", "borrow $100", "withdraw all", "uber eats", "my address", "history", "rates", "help", "report". Null for unrecognized. |
| `lib/smart-cards.test.ts` | Account state → correct smart cards. Empty account → no cards. Rewards > $0 → rewards card. Idle > $10 → idle card. Rate diff > 0.3% → better rate card. Low health → risk card. |
| `hooks/useChipFlow.test.ts` | State machine transitions: L1 → L2 → confirmation → result → reset. Cancel at any step → reset. |
| `hooks/useZkLogin.test.ts` | Session restore from localStorage. Expired session → `idle` state. Mock OAuth flow. |

**Test framework:** Vitest (already in the monorepo) + React Testing Library for hooks/components.

**What NOT to test in unit tests:**
- Don't test actual Google OAuth (integration/E2E)
- Don't test actual ZK proof generation (mock it)
- Don't test actual on-chain transactions (mock the SDK)

#### E2E Tests (Week 5 — Beta)

Manual testing checklist for beta:

| Flow | Test |
|------|------|
| Onboarding | Google sign-in → loading screen → dashboard. Fresh account. |
| Save | [Save] → [$100] → confirm → balance updates. |
| Send | [Send] → [Contact] → [$50] → confirm → tx success. |
| Services | [Services] → Gift Cards → Uber Eats → $25 → confirm → receipt with code. |
| Smart cards | Fund account → idle funds card appears → tap [Move to savings] → card disappears. |
| Error | Try withdraw more than available → actionable error card. |
| Session | Wait for session expiry → warning card → refresh → still works. |
| Mobile | All flows on iPhone Safari. Chips visible. Input doesn't get covered by keyboard. |

Automated E2E (post-beta, not MVP): Playwright for critical paths (sign-in, save, send).

### Documentation

| Doc | Phase | Content |
|-----|-------|---------|
| `apps/web-app/README.md` | Week 2 | Setup instructions, env vars, dev server, Vercel deploy |
| `packages/sdk/README.md` | Week 1 | **Update existing** — add `./browser` entry docs, `T2000.fromZkLogin()` example, `TransactionSigner` interface |
| `ARCHITECTURE.md` | Week 5 | **Update existing** — add web app to architecture diagram, zkLogin flow, cross-platform SDK |
| `spec/T2000_V3_SPEC.md` | Ongoing | Already complete — update if decisions change during build |
| Inline JSDoc | All phases | `TransactionSigner`, `ZkLoginSigner`, `useZkLogin`, `useChipFlow`, `parseIntent` — all public APIs get JSDoc |

**What NOT to document separately:**
- No separate API docs for the web app (it's a frontend, not an API)
- No user-facing docs (the product is self-explanatory — that's the whole point of "dead simple")
- No wiki or Notion — everything stays in-repo as markdown

---

## Phase 8: UX Design Pass

> Comprehensive gap analysis: spec wireframes vs current implementation. Every item maps to a specific wireframe in `T2000_V3_SPEC.md`.

The dashboard works mechanically (transactions execute, balances update) but the **experience** doesn't match the spec's vision. The spec defines a product where the AI has already analyzed the user's account and shows what matters — the current implementation shows dead space because it lacks data. This phase wires real data, fixes UX flows, and aligns every screen with its wireframe.

**Guiding principle from the spec:** *"Every time the user opens the app, the AI has analyzed their account and shows what matters. No generic greeting. No 'Welcome back.' The dashboard IS the intelligence."*

---

### 8.1 — Smart Cards Data Wiring (Critical — The Biggest Gap)

**Spec ref:** "What Smart Cards Appear (and When)" table — 7 MVP cards.

**Problem:** The `accountState` object in `dashboard/page.tsx` hardcodes `savingsRate: 0`, `pendingRewards: 0`, and leaves `bestAlternativeRate`, `healthFactor`, `overnightEarnings` as `undefined`. As a result, `deriveSmartCards()` only ever returns the `all-good` card ("Your account is working for you"), creating the empty dashboard the user reported.

**Data wiring needed:**

| `AccountState` field | Data source | API | Priority |
|---------------------|------------|-----|----------|
| `savingsRate` | NAVI/Suilend supply APY for user's position | New: `GET /api/positions?address=X` (extend existing) | P0 |
| `pendingRewards` | NAVI unclaimed incentive rewards | New: `GET /api/rewards?address=X` | P0 |
| `bestAlternativeRate` | Compare all lending protocol rates | New: `GET /api/rates` | P1 |
| `currentRate` | User's current weighted APY | Derive from positions API | P1 |
| `healthFactor` | NAVI borrow health factor | Extend positions API | P0 |
| `overnightEarnings` | Diff of savings position value vs last visit | `localStorage` last-seen value + positions API | P2 |
| `isFirstOpenToday` | Check `localStorage` last-open timestamp | Client-side only | P2 |

**Implementation:**

1. **Extend `/api/positions` response** to include `savingsRate`, `healthFactor`, individual position details:

```typescript
// Current response:
{ savings: number, borrows: number }

// New response:
{
  savings: number,
  borrows: number,
  savingsRate: number,        // weighted avg APY across all supply positions
  healthFactor: number | null, // null when no borrows
  pendingRewards: number,
  positions: {
    supplies: [{ asset: string, amount: number, amountUsd: number, apy: number, protocol: string }],
    borrows: [{ asset: string, amount: number, amountUsd: number, apy: number, protocol: string }],
  }
}
```

2. **Create `/api/rates` endpoint** — calls `navi.getAllRates()` + `suilend.getAllRates()`, returns best available rate with protocol name.

3. **Update `useBalance` hook** — consume the extended positions response, pass through to `accountState`.

4. **Update `accountState` construction in `dashboard/page.tsx`**:

```typescript
const accountState: AccountState = {
  checking: balance.checking,
  savings: balance.savings,
  savingsRate: positionsData?.savingsRate ?? 0,
  pendingRewards: positionsData?.pendingRewards ?? 0,
  bestAlternativeRate: ratesData?.bestRate,
  currentRate: positionsData?.savingsRate,
  healthFactor: positionsData?.healthFactor ?? undefined,
  overnightEarnings: computeOvernightEarnings(balance.savings),
  isFirstOpenToday: checkFirstOpenToday(),
  sessionExpiringSoon: expiringSoon,
  receivedAmount: receivedAmount ?? undefined,
};
```

5. **Add `overnightEarnings` client-side logic:**
   - On dashboard mount, read `localStorage('t2000_last_savings')`.
   - If savings > lastSavings and it's a new day → `overnightEarnings = savings - lastSavings`.
   - Write current savings to localStorage on each load.

**Expected result after wiring:**
- User with $8 checking, $2 savings → sees idle funds card: "💰 $8 idle — could earn $X.XX/mo at 4.9%"
- User with unclaimed rewards → sees rewards card: "🏆 $0.12 in rewards [Claim $0.12]"
- User with active borrow → sees health factor card when HF < 1.5
- Dashboard is **never empty** for a funded account

---

### 8.2 — Landing Page Alignment

**Spec ref:** "Screen 1: Landing" wireframe.

**Problem:** Current landing page is functional but doesn't match the spec wireframe. Missing three value props above the fold and "How it works" section below the fold.

**Current:**
```
"A bank account that works for you."
+ generic description
+ Sign in with Google
+ 3 stat boxes (41 Services, 90+ Endpoints, 0 Fees)
```

**Spec wireframe:**
```
"A bank account that works for you."

"Your money earns 6-8% while you sleep."
"Pay for any service — no accounts, no subscriptions."
"Invest in crypto and gold with one tap."

[Sign in with Google]

--- below the fold ---

How it works
1. Sign in with Google
2. Add funds
3. That's it.

[Sign in with Google]
```

**Changes to `app/page.tsx`:**
- Replace generic description with three distinct value props (earn, pay, invest)
- Add "How it works" 1-2-3 section below the fold with second CTA
- Move stat boxes below the "How it works" section or remove (they're developer-facing, not consumer)
- Match spec note: "Zero jargon above the fold. No: yield, USDC, DeFi, seed phrase, keys, blockchain, Sui"

---

### 8.3 — Chip Flow Context Messages

**Spec ref:** Every chip flow wireframe includes an AI context message. E.g., Save shows "Save to earn 6.8%. You have $105 available."

**Problem:** `getFlowMessage()` in `useChipFlow.ts` returns static strings without real data: "Save to earn yield. Choose an amount:" — no rate, no available balance.

**Fix:** Make `getFlowMessage()` accept balance data and return contextual messages:

| Flow | Current message | Spec message |
|------|----------------|-------------|
| Save | "Save to earn yield." | "Save to earn 6.8%. You have $105 available." |
| Send | "Who do you want to send to?" | "Who do you want to send to?" (✓ already correct) |
| Withdraw | "Withdraw from savings." | "Withdraw from savings. You have $880 saved." |
| Borrow | "Borrow against your savings." | "Borrow against your savings. You can borrow up to $440." |
| Repay | "Repay your loan." | "Repay your loan. Outstanding debt: $200." |

**Implementation:** Change `startFlow` to accept a `context` parameter:

```typescript
startFlow(flow: string, context?: {
  checking?: number;
  savings?: number;
  borrows?: number;
  savingsRate?: number;
  maxBorrow?: number;
});
```

Update `dashboard/page.tsx` `handleChipClick` to pass balance context when starting flows.

---

### 8.4 — Send Flow UX Improvements

**Spec ref:** "[Send]" chip flow wireframe — "Who do you want to send to? [Alex] [Mom] [📋 Paste Address] [📷 Scan QR]"

**Problems identified by user:**
1. No visible "Next" or "Go" button after pasting an address — only Enter key works
2. No explicit "Save contact" option during the flow
3. Missing [📋 Paste] and [📷 Scan QR] helper buttons per spec

**Changes to send flow in `dashboard/page.tsx`:**

1. **Add a "Go" button** next to the address input (visible when input has content):
```
┌──────────────────────────────────────┐
│ Paste address (0x...) or name   [Go] │
└──────────────────────────────────────┘
```

2. **Add [📋 Paste] button** — calls `navigator.clipboard.readText()` and fills the input:
```
[📋 Paste]  [📷 Scan QR]
```
(QR scan is post-MVP — show only Paste for now)

3. **Keep contact toast after success** (already exists) — but make it more prominent by appearing immediately after the result card, not buried.

---

### 8.5 — Dashboard Layout & Dead Space

**Spec ref:** "Three zones" — Top (balance), Middle (smart cards), Bottom (input + chips).

**Problem:** The user sees "too much dead space" and "always pressing More..." The bottom bar takes significant vertical space (input + chips + cancel), and when no smart cards show, the middle zone is empty.

**Changes:**

1. **Always show smart cards** — after 8.1 data wiring, the dashboard will have 1-4 cards. The "dead space" problem is primarily a data problem, not a layout problem.

2. **Reduce bottom bar height** — the ChipBar currently wraps to two rows when "More" is expanded. On mobile, this pushes content up significantly.

3. **Smart cards always visible** — currently smart cards are hidden when there are feed items (`!hasFeedItems`). Per spec, smart cards should ALWAYS be visible below the feed:

```typescript
// Current (hides smart cards when feed has items and user is not in a flow):
{!isInFlow && !hasFeedItems && <SmartCardFeed ... />}

// Spec behavior: smart cards always visible, below feed items
{!isInFlow && <SmartCardFeed ... />}
```

This is already partially implemented (smart cards show below feed when `hasFeedItems && !isInFlow`) but the condition logic should be simplified.

4. **Chip bar reorganization** — address the "More..." complaint:

   **Option A (recommended):** Make L1 chips context-aware. When user has savings, show [Withdraw] in L1. When user has debt, show [Repay] in L1. Dynamic 4-chip bar:

   | Account state | L1 chips |
   |--------------|----------|
   | Has checking only | [Save] [Send] [Services] [More...] |
   | Has savings | [Save] [Withdraw] [Send] [More...] |
   | Has debt | [Repay] [Save] [Send] [More...] |
   | Has everything | [Save] [Send] [Withdraw] [More...] |

   **Option B:** Horizontal scrollable chip bar showing all 8-10 chips in a single row:
   ```
   ← [Save] [Send] [Withdraw] [Borrow] [Repay] [Services] [Report] [Help] →
   ```
   Pro: no More button. Con: less discoverable on small screens.

---

### 8.6 — Empty State Enhancement

**Spec ref:** "Dashboard — Empty State ($0 balance, first login)" wireframe.

**Problem:** Current empty state shows a text-only card: "Add funds to get started. Send SUI from any exchange..." The spec wireframe shows the address prominently with a copy button inline.

**Changes to `smart-cards.ts`** — the `all-good` empty-state card should trigger a richer display. Instead of a simple SmartCard, the empty state should render as a special component:

```
┌──────────────────────────────────────┐
│  👋 Welcome to t2000                 │
│                                      │
│  Your account is ready. Add funds    │
│  to get started.                     │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  0x7f20...f6dc           [📋] │  │
│  │                                │  │
│  │  Send USDC from any exchange  │  │
│  │  or Sui wallet to start.     │  │
│  └────────────────────────────────┘  │
│                                      │
│  [Show QR code]                      │
└──────────────────────────────────────┘
```

**Implementation:**
- Add a new `WelcomeCard` component (or enhance `SmartCard` with a `variant` prop)
- Show copyable address inline within the card
- "Show QR code" chip opens the receive flow

---

### 8.7 — Confirmation Card Enhancement

**Spec ref:** Every confirmation card wireframe includes fee, rate, and estimated outcome.

**Problem:** Current confirmation card shows only: Amount, To (for send), Gas (Sponsored). Missing: fee amount, current rate, estimated monthly yield.

**Spec confirmation card (Save flow):**
```
Save $100 · earning 6.8%
Fee: $0.50
Gas: Sponsored

[✓ Save $100]     Cancel
```

**Changes to `getConfirmationDetails()` in `dashboard/page.tsx`:**

```typescript
const getConfirmationDetails = () => {
  const flow = chipFlow.state.flow;
  const amount = chipFlow.state.amount ?? 0;
  const details: { label: string; value: string }[] = [];

  details.push({ label: 'Amount', value: `$${amount.toFixed(2)}` });

  if (flow === 'save' && positionsData?.savingsRate) {
    details.push({ label: 'Rate', value: `${positionsData.savingsRate.toFixed(2)}% APY` });
    const monthlyYield = (amount * (positionsData.savingsRate / 100)) / 12;
    details.push({ label: 'Est. monthly yield', value: `~$${monthlyYield.toFixed(2)}` });
  }

  if (flow === 'send' && chipFlow.state.recipient) {
    details.push({ label: 'To', value: chipFlow.state.subFlow ?? chipFlow.state.recipient });
  }

  if (flow === 'borrow') {
    details.push({ label: 'Interest rate', value: `${borrowRate?.toFixed(2) ?? '?'}% APY` });
  }

  details.push({ label: 'Gas', value: 'Sponsored (free)' });
  // TODO: Add protocol fee when dry-run is implemented

  return {
    title: `${flow?.charAt(0).toUpperCase()}${flow?.slice(1)} $${amount.toFixed(2)}`,
    confirmLabel: `${flow?.charAt(0).toUpperCase()}${flow?.slice(1)} $${amount.toFixed(2)}`,
    details,
  };
};
```

---

### 8.8 — Error States with Actionable Chips

**Spec ref:** "Error States in the Feed" — errors as inline cards with actionable chips.

**Problem:** Current errors show generic messages without actionable recovery chips. The spec shows context-aware errors:

```
🤖 Can't withdraw $500 right now — you'd need to repay some of
your $200 loan first.

[Repay $50 first]  [Withdraw $300]  [Why?]
```

**Changes to `lib/errors.ts` — `mapError()` function:**

Add context-aware error mapping that returns actionable chips:

```typescript
// Enhance mapError to accept context
function mapError(err: unknown, context?: {
  flow?: string;
  amount?: number;
  savings?: number;
  borrows?: number;
  checking?: number;
}): FeedItemData {
  const msg = extractMessage(err);

  // Insufficient balance for withdraw
  if (msg.includes('insufficient') && context?.flow === 'withdraw') {
    const available = context.savings ?? 0;
    return {
      type: 'error',
      message: `Can't withdraw $${context.amount} — you only have $${available.toFixed(0)} in savings.`,
      chips: available > 0
        ? [{ label: `Withdraw $${Math.floor(available)}`, flow: 'withdraw' }]
        : [],
    };
  }

  // Health factor too low
  if (msg.includes('health') || msg.includes('liquidation')) {
    return {
      type: 'error',
      message: 'Your position is getting risky — repay some debt before borrowing more.',
      chips: [
        { label: 'Repay $50', flow: 'repay' },
        { label: 'Why?', flow: 'risk-explain' },
      ],
    };
  }

  // Generic fallback with contextual chips
  return {
    type: 'error',
    message: msg,
    chips: context?.flow ? [{ label: 'Try again', flow: context.flow }] : [],
  };
}
```

---

### 8.9 — Repay Validation

**Spec ref:** Implicit — the spec never shows a repay flow without an active borrow position.

**Problem:** User was able to repay $2 without having borrowed anything. No validation against actual borrow position.

**Changes:**

1. **In `dashboard/page.tsx` `handleChipClick`** — when starting repay flow, check if user has active borrows:

```typescript
if (flow === 'repay') {
  if (balance.borrows <= 0) {
    feed.addItem({
      type: 'ai-text',
      text: 'You don\'t have any active debt to repay.',
      chips: [{ label: 'Borrow', flow: 'borrow' }],
    });
    return;
  }
  chipFlow.startFlow('repay', { borrows: balance.borrows });
  return;
}
```

2. **In `handleAmountSelect`** — for repay, cap amount at outstanding debt:
```typescript
if (chipFlow.state.flow === 'repay' && amount > balance.borrows) {
  chipFlow.selectAmount(balance.borrows);
  return;
}
```

3. **Repay "All" label** — show debt amount: `All $${Math.floor(balance.borrows)}`

---

### 8.10 — Settings Panel Completion

**Spec ref:** "Settings (slide-over panel)" wireframe.

**Problem:** Settings panel is missing spec items: email display, contacts management, safety limits, emergency lock.

**Current vs Spec:**

| Setting | Spec | Current | Priority |
|---------|------|---------|----------|
| Google email | ✓ "user@gmail.com" | ✗ Missing | P1 |
| Address + copy | ✓ | ✓ | Done |
| Session expiry + refresh | ✓ | ✓ | Done |
| Contacts list + manage | ✓ "Alex · Mom · 0x9c4d..." | ✗ Missing | P1 |
| Safety limits | ✓ "Max per tx: $1,000" | ✗ Missing | P2 |
| Suiscan link | ✓ | ✓ | Done |
| Emergency lock | ✓ "🔴 Emergency Lock" | ✗ Missing | P2 |
| Sign out | ✓ | ✓ | Done |

**Changes to `SettingsPanel.tsx`:**

1. **Add email display** — extract from zkLogin JWT (the `email` claim):
```
📧 user@gmail.com
Signed in with Google
```

2. **Add contacts section** — show saved contacts with delete option:
```
Contacts
Alex · Mom · 0x9c4d...
[Manage contacts]
```

3. **Add safety limits section (P2):**
```
Safety limits
Max per transaction: $1,000
Max daily send: $5,000
[Change limits]
```

4. **Add emergency lock (P2):**
```
[🔴 Emergency Lock]
```

---

### 8.11 — Invest & Swap Guided Flows

**Spec ref:** "[Invest]" and "[Swap]" chip flow wireframes.

**Problem:** Both flows currently show text stubs instead of guided chip flows.

**Invest flow spec:**
```
[Invest] → "What would you like to invest in?"
→ [SUI] [BTC] [ETH] [GOLD]
→ user taps [SUI]
→ "Buy SUI at $0.995."
→ [$25] [$50] [$100] [$500]
→ confirmation card
```

**Swap flow spec:**
```
[Swap] → "Swap between tokens."
→ From: [Dollars ▼]  To: [SUI] [BTC] [ETH]
→ amount chips
→ confirmation card
```

**Implementation:**
- Extend `useChipFlow` to support multi-step flows (currently only supports: start → amount → confirm)
- Add `subFlow` steps for asset selection
- Wire to SDK `exchange()` method for swaps, `invest()` for investments
- These can be stubs that show "Coming soon" for the actual execution — the UX flow itself should be built

---

### 8.12 — Result Card Post-Transaction

**Spec ref:** "After Completing an Action" wireframe.

**Problem:** After a transaction, the result card appears but smart cards don't immediately update to reflect the new state. The spec shows:

```
✓ Saved $100. Now earning 6.8% on $980.

🏆 $12.40 in rewards
[Claim $12.40]
```

**Changes:**
- After transaction success, immediately invalidate and refetch balance + positions queries
- Show updated smart cards below the result card
- The result card message should include context: "Saved $100. Now earning X% on $Y." (requires positions data)

---

### Implementation Priority

| Task | Est. | Blocking beta? | Depends on |
|------|------|----------------|------------|
| **8.1** Smart cards data wiring | 3-4h | **Yes** — empty dashboard is the #1 UX complaint | Extend `/api/positions`, new `/api/rates` |
| **8.2** Landing page alignment | 1h | No — functional but not polished | None |
| **8.3** Chip flow context messages | 30m | No — works without, but feels generic | 8.1 (needs rate data) |
| **8.4** Send flow UX (Go button, Paste) | 45m | Partial — Enter-only is confusing | None |
| **8.5** Dashboard layout / dead space | 1h | Partial — solved mostly by 8.1 | 8.1 |
| **8.6** Empty state enhancement | 30m | No — works but not per spec | None |
| **8.7** Confirmation card enhancement | 30m | No — works but lacks detail | 8.1 |
| **8.8** Error states with chips | 1h | No — errors work but aren't actionable | None |
| **8.9** Repay validation | 30m | **Yes** — allows invalid transactions | None |
| **8.10** Settings panel completion | 1-2h | No — all essential settings work | None |
| **8.11** Invest & swap guided flows | 2h | No — stubs are acceptable for beta | ✅ Completed |
| **8.12** Post-transaction smart card refresh | 30m | No — polish | 8.1 |

**Total estimate:** ~12-14 hours

**For beta:** 8.1 (smart cards data) + 8.9 (repay validation) are blocking. 8.4 (send UX) is highly recommended. Everything else is polish.

---

### Wireframe Cross-Reference

Every item above maps to a specific wireframe in `T2000_V3_SPEC.md`:

| Task | Spec section | Line range |
|------|-------------|------------|
| 8.1 | "What Smart Cards Appear (and When)" | Lines 269-293 |
| 8.2 | "Screen 1: Landing" | Lines 131-186 |
| 8.3 | "[Save]", "[Borrow]", "[Withdraw]" chip flows | Lines 506-579 |
| 8.4 | "[Send]" chip flow | Lines 526-546 |
| 8.5 | "Three zones" dashboard layout | Lines 223-263 |
| 8.6 | "Dashboard — Empty State" | Lines 787-825 |
| 8.7 | Confirmation card in every flow wireframe | Lines 390-404, 517-522 |
| 8.8 | "Error States in the Feed" | Lines 827-840 |
| 8.9 | "[Repay]" flow (implicit — no repay without borrow) | Lines 550-564 |
| 8.10 | "Settings (slide-over panel)" | Lines 881-921 |
| 8.11 | "[Invest]" and "[Swap]" chip flows | Lines 583-620 |
| 8.12 | "After Completing an Action" | Lines 312-324 |

---

## Outstanding Items

Everything remaining after Phases 1-8. Ordered by priority.

### P0 — Server Tests ✅

Write missing test coverage for web-app API routes.

| File | Tests | Est. |
|------|-------|------|
| `app/api/zklogin/salt/route.test.ts` | Valid JWT → returns salt. Invalid JWT → 401. Missing JWT → 400. Same sub → same salt (deterministic). | 20 min |
| `app/api/user/preferences/route.test.ts` | GET → returns contacts/limits. POST → upserts. Missing address → 400. Invalid body → 400. | 20 min |

### P1 — Real Balance Polling ✅

Dashboard balance polling wired to Sui RPC + NAVI positions.

### P2 — Smart Cards from Real Data ✅

`deriveSmartCards()` wired with real balance. Received-funds card detects incoming transfers.

### P3 — Real Transaction Execution ✅

All core flows (save, send, withdraw, borrow, repay) execute real on-chain transactions via Enoki-sponsored flow.

---

### P3.1 — Enoki Sponsored Transactions ✅

**Critical for beta.** Without gas sponsorship, new zkLogin users cannot execute any transaction (they have 0 SUI). This makes the entire app unusable for new users.

#### Overview

Replace the current direct-to-RPC submission flow with Enoki-sponsored transactions. The user **never needs SUI for gas** — Enoki pays from a pre-funded gas pool. The flow remains **fully non-custodial**: the user's ephemeral key never leaves the browser.

#### Current Flow (P3)

```
Client → POST /api/transactions/prepare → Server builds full tx → Returns txBytes
Client signs txBytes locally with zkLogin signer
Client submits directly to Sui RPC → Requires user SUI for gas ❌
```

#### New Flow (P3.1)

```
1. Client → POST /api/transactions/prepare
   Server builds tx with onlyTransactionKind: true
   Server calls Enoki POST /v1/transaction-blocks/sponsor
   Server returns { bytes, digest } to client

2. Client signs `bytes` locally with zkLogin signer (NON-CUSTODIAL)

3. Client → POST /api/transactions/execute
   Server calls Enoki POST /v1/transaction-blocks/sponsor/:digest
   Server returns { digest } to client
   
User needs 0 SUI for gas ✅
```

#### Security Model

| Party | Has access to | Does NOT have |
|-------|--------------|---------------|
| **Client (browser)** | Ephemeral keypair, zkLogin proof, session JWT | Enoki private API key |
| **Server (Next.js)** | Enoki private key, tx structure, user JWT | User's ephemeral private key |
| **Enoki (Mysten)** | Gas pool SUI, sponsored tx bytes | User's ephemeral private key |

- Signing (step 2) happens **entirely in the browser** — ephemeral key never transmitted
- Server only receives the final `signature` string, never the private key
- Enoki never sees the user's private key either
- Same security model as hardware wallets

#### Enoki Portal Setup (Manual — Pre-Implementation)

1. **Create a private API key** in Enoki Portal
   - Enable: "Sponsored Transactions"
   - Enable network: "Mainnet"
   - This key stays server-side only (`ENOKI_SECRET_KEY`)

2. **Fund the gas pool**
   - Deposit SUI into the Enoki gas pool via the portal dashboard
   - Start with 5-10 SUI for beta testing (~500-1000 sponsored transactions)
   - Monitor usage in portal analytics

3. **Configure allowed targets (recommended)**
   - Restrict sponsorship to known Move call targets to prevent abuse:
     - `0x2::coin::*` (transfers)
     - `0x2::pay::*` (payments)
     - NAVI Protocol addresses (save/withdraw/borrow/repay)
     - Cetus addresses (swaps)
   - Or leave unrestricted initially and tighten post-beta

#### Environment Variables

| Variable | Type | Where | Description |
|----------|------|-------|-------------|
| `ENOKI_SECRET_KEY` | Private | Server only (`.env.local` + Vercel) | Enoki private API key for sponsorship |
| `NEXT_PUBLIC_ENOKI_API_KEY` | Public | Already exists | Enoki public key (zkLogin auth) |
| `NEXT_PUBLIC_SUI_NETWORK` | Public | Already exists | Network for sponsorship requests |

**Critical:** `ENOKI_SECRET_KEY` must NEVER be exposed to the client. It is used only in server-side API routes.

#### Implementation Tasks

**Task 1: Update `/api/transactions/prepare` route**

Current: builds full tx → returns `txBytes`
New: builds tx kind → sponsors via Enoki → returns `{ bytes, digest }`

Changes:
- Build with `tx.build({ client, onlyTransactionKind: true })` instead of `tx.build({ client })`
- Call Enoki `POST /v1/transaction-blocks/sponsor` with:
  - `Authorization: Bearer ENOKI_SECRET_KEY` (private key)
  - `zklogin-jwt: <user's JWT>` (forwarded from client)
  - Body: `{ network, transactionBlockKindBytes, sender, allowedAddresses?, allowedMoveCallTargets? }`
- Return `{ bytes, digest }` from Enoki response (instead of raw `txBytes`)
- Add JWT forwarding from client request header

File: `apps/web-app/app/api/transactions/prepare/route.ts`

**Task 2: Create `/api/transactions/execute` route**

New server route that submits the user's signature to Enoki for execution.

Endpoint: `POST /api/transactions/execute`
Request body: `{ digest: string, signature: string }`
Server action: call Enoki `POST /v1/transaction-blocks/sponsor/:digest` with `{ signature }`
Response: `{ digest: string }`

File: `apps/web-app/app/api/transactions/execute/route.ts`

**Task 3: Update `useAgent` hook**

Current flow: prepare → sign → submit to Sui RPC directly
New flow: prepare → sign → execute via server

Changes:
- `signAndSubmit()` sends JWT in prepare request header
- After signing, POST to `/api/transactions/execute` instead of `suiClient.executeTransactionBlock()`
- Remove direct `suiClient` dependency for transaction submission
- Handle Enoki-specific error codes

File: `apps/web-app/hooks/useAgent.ts`

**Task 4: Update constants and CSP**

- Add `ENOKI_SECRET_KEY` to `lib/constants.ts` (server-side only, no `NEXT_PUBLIC_` prefix)
- CSP `connect-src` already allows `api.enoki.mystenlabs.com` ✅
- No CSP changes needed (Enoki calls happen server-side)

File: `apps/web-app/lib/constants.ts`

**Task 5: Forward JWT from zkLogin session**

The Enoki sponsorship endpoint can accept a `zklogin-jwt` header to identify the user. The client needs to forward its JWT from the zkLogin session to the prepare route.

Changes:
- `useAgent` includes `session.jwt` in the `Authorization` or custom header when calling `/api/transactions/prepare`
- Server forwards this JWT to Enoki's sponsor endpoint
- JWT is already stored in the zkLogin session (no new auth flow needed)

File: `apps/web-app/hooks/useAgent.ts`, `apps/web-app/app/api/transactions/prepare/route.ts`

**Task 6: Error handling**

Map Enoki-specific error responses to user-friendly messages:

| Enoki Error | User Message | Action |
|-------------|-------------|--------|
| `INSUFFICIENT_GAS_POOL` | "Service temporarily unavailable" | Alert admin to refund gas pool |
| `RATE_LIMITED` | "Too many transactions. Try again shortly." | Show retry timer |
| `INVALID_TRANSACTION` | "Transaction rejected" | Show error details |
| `DISALLOWED_MOVE_CALL` | "This action is not supported" | Log for debugging |
| Network error | "Connection error. Retrying..." | Auto-retry once |

File: `apps/web-app/lib/errors.ts`

**Task 7: Fallback strategy**

If Enoki sponsorship fails (gas pool empty, rate limited, Enoki down), attempt self-funded execution as fallback — but only if the user has sufficient SUI balance.

```
try sponsored via Enoki
  → if fails and user has SUI > 0.01:
    → fall back to self-funded (current P3 flow)
  → if fails and user has no SUI:
    → show error "Gas pool temporarily empty. Please try again later."
```

File: `apps/web-app/hooks/useAgent.ts`

#### Testing

**Unit tests:**

| Test | File | What it verifies |
|------|------|-----------------|
| Prepare route calls Enoki sponsor API | `route.test.ts` | Correct endpoint, headers, body format |
| Prepare route forwards JWT | `route.test.ts` | JWT passed in `zklogin-jwt` header |
| Execute route calls Enoki execute API | `route.test.ts` | Correct digest path param, signature body |
| Execute route validates inputs | `route.test.ts` | Missing digest/signature → 400 |
| Error mapping for Enoki responses | `errors.test.ts` | Each error code → correct user message |

**Integration tests (manual):**

| Test | Expected Result |
|------|----------------|
| New user (0 SUI) sends USDC | Transaction succeeds, user pays 0 gas |
| New user (0 SUI) saves to NAVI | Transaction succeeds, user pays 0 gas |
| Rapid-fire 10 transactions | First N succeed, rate limit kicks in gracefully |
| Enoki gas pool empty | Graceful error message, no crash |
| Enoki API down | Fallback to self-funded if user has SUI; error if not |
| Verify tx on Suiscan | Sponsor address is Enoki's, not user's |

#### Cost Analysis

| Metric | Estimate |
|--------|----------|
| Average gas per tx | ~0.002-0.01 SUI |
| Gas pool per 1 SUI | ~100-500 sponsored transactions |
| Beta (100 users × 5 tx/day × 30 days) | ~15,000 txs → ~30-150 SUI |
| Abuse vector | Rate limiting + allowedMoveCallTargets |

#### Monitoring & Alerts

- Track gas pool balance via Enoki Portal analytics
- Set up alert when gas pool drops below 2 SUI
- Log all sponsorship requests/failures in server logs
- Dashboard for sponsorship usage (post-beta)

#### Dependencies

- Enoki Portal: private API key with sponsored transactions enabled
- Enoki Portal: gas pool funded with SUI
- P3 (real transaction execution) ✅ — already done

#### Files Changed

| File | Action |
|------|--------|
| `app/api/transactions/prepare/route.ts` | Modify — add Enoki sponsor call |
| `app/api/transactions/execute/route.ts` | **New** — Enoki execute endpoint |
| `app/api/transactions/execute/route.test.ts` | **New** — unit tests |
| `app/api/transactions/prepare/route.test.ts` | Modify — update tests for new response shape |
| `hooks/useAgent.ts` | Modify — new sign+execute flow |
| `lib/constants.ts` | Modify — add ENOKI_SECRET_KEY |
| `lib/errors.ts` | Modify — add Enoki error mapping |
| `.env.local` | Modify — add ENOKI_SECRET_KEY |

---

### P4 — MPP LLM Integration ⏳

**Bucket 2C + 2D.** `useLlm` currently returns local keyword-matched responses. Wire to real LLM via MPP.

**Architecture decision needed:** How does the web app call the LLM?
- **Option A:** Client → MPP gateway directly (exposes gateway URL to client)
- **Option B:** Client → Next.js API route → MPP gateway (server-side proxy, keeps gateway URL private)
- **Recommendation:** Option B (server-side proxy at `/api/llm/query`)

**Changes:**
- Create `app/api/llm/query/route.ts` — proxies to MPP gateway with `LLM_SYSTEM_PROMPT`
- Update `hooks/useLlm.ts` to POST to `/api/llm/query`
- Pass user address + balance context to system prompt
- Return structured responses (text, chips, tool calls)

**Depends on:** Gateway LLM endpoint availability

### P5 — MPP Services Execution ⏳

**Bucket 2F.** Service form submit is display-only. Wire to MPP for real execution.

**Changes:**
- Create `app/api/services/execute/route.ts` — proxies to MPP gateway
- `handleServiceSubmit` calls the API route with service ID + form values
- Parse MPP response → render as receipt/result card in feed
- Handle errors (insufficient balance, service unavailable)

**Depends on:** P4 architecture decision (same proxy pattern)

### P6 — LLM Tool Calling ⏳

**Bucket 2H.** 35 MCP tools and 20 prompts exist but aren't callable from the web app LLM.

**Changes:**
- LLM system prompt includes tool definitions (subset relevant to web users)
- Server-side proxy parses tool_use responses from Claude
- Execute tool calls server-side → return results to client
- Priority tools: `t2000_overview`, `t2000_balance`, `t2000_all_rates`, `t2000_history`

**Depends on:** P4 (LLM integration)

### P7 — Service Intent Parsing ⏳

**Bucket 3, item 4.** Typing "uber eats" currently falls through to LLM. Should be parsed client-side.

**Changes:**
- Add service intent patterns to `intent-parser.ts`
- Fuzzy match service names from `SERVICE_CATALOG`
- On match → open `ServicesPanel` with service pre-selected

**Depends on:** Nothing (can be done anytime)

### P8 — Gift Card Brand Grid ⏳

**Bucket 3, item 3.** Spec has a visual brand tile grid for gift cards. Currently a single form entry.

**Changes:**
- Fetch Reloadly catalog (or hardcode top 20 brands)
- `GiftCardGrid` component with brand tiles
- Tap brand → amount chips → email input → confirm

**Depends on:** Reloadly API access / catalog data

### P9 — Settings Panel Extras ⏳

**Bucket 1, item 6.** Settings panel is missing spec items.

| Item | Priority |
|------|----------|
| Google email display | Low |
| Contacts management (view/delete) | Medium |
| Safety limits (daily send cap) | Post-MVP |
| Emergency lock | Post-MVP |

### P10 — Vercel Deployment Cleanup ⏳

Mark deployment as complete. Clean up:
- Remove unused `/api/zklogin/salt` route (now using Enoki)
- Remove `ZKLOGIN_MASTER_SEED` env var from Vercel (no longer needed)
- Remove `API_BASE_URL` from constants (unused)
- Verify CSP headers allow only Enoki (remove old prover domains)

### Summary

| Priority | Item | Blocking beta? | Status |
|----------|------|----------------|--------|
| **P0** | Server tests | No, but good hygiene | ✅ |
| **P1** | Real balance polling | **Yes** — core UX | ✅ |
| **P2** | Smart cards from real data | **Yes** — depends on P1 | ✅ |
| **P3** | Real transaction execution | **Yes** — core product | ✅ |
| **P3.1** | Enoki sponsored transactions | **Yes** — without gas, new users can't transact | ✅ |
| **UX-1** | Smart cards data wiring (8.1) | **Yes** — #1 UX complaint (empty dashboard) | ✅ |
| **UX-2** | Repay validation (8.9) | **Yes** — allows invalid transactions | ✅ |
| **UX-3** | Send flow UX (8.4 — Go button, Paste) | Recommended — Enter-only confuses users | ✅ |
| **UX-4** | Chip flow context messages (8.3) | No — generic messages work | ✅ |
| **UX-5** | Landing page alignment (8.2) | No — functional | ✅ |
| **UX-6** | Dashboard layout / chip bar (8.5) | Partial — solved by UX-1 | ✅ |
| **UX-7** | Empty state enhancement (8.6) | No — works | ✅ |
| **UX-8** | Confirmation card detail (8.7) | No — works | ✅ |
| **UX-9** | Actionable error chips (8.8) | No — errors work | ✅ |
| **UX-10** | Settings panel completion (8.10) | No — essential settings work | ✅ |
| **UX-11** | Invest & swap flows (8.11) | No — stubs acceptable | ✅ Completed |
| **UX-12** | Post-tx smart card refresh (8.12) | No — polish | ✅ |
| **P4** | MPP LLM integration | No — keyword fallback works | ✅ |
| **P5** | MPP services execution | No — display-only acceptable | ✅ Completed |
| **P6** | LLM tool calling | No — post-beta | ✅ Completed |
| **P7** | Service intent parsing | No — LLM fallback handles it | ✅ Completed |
| **P8** | Gift card brand grid | No — post-beta | ✅ Completed |
| **P9** | Settings panel extras | No — post-beta (see UX-10) | ✅ Completed |
| **P10** | Vercel cleanup | No — housekeeping | ✅ |

**Beta blockers are all complete.** UX-10/11, P5-P9 are post-beta polish. P10 done (removed unused salt route).

---

## Cross-Cutting Priorities (from OWS Assessment)

These priorities were identified during the OWS assessment (see `spec/archive/OWS_INTEGRATION_SPEC.md`) and apply across the entire codebase, not just the web app.

### CC-1 — CLI Unit Tests (P0)

The CLI (`packages/cli`) has **0 tests**. This is the biggest test gap in the entire monorepo. Must be fixed before adding any new CLI features or integrations.

| Command | Test coverage needed |
|---------|---------------------|
| `init` | Wallet creation, MCP setup, safeguard config |
| `save` / `withdraw` / `borrow` / `repay` | Amount validation, dry-run, execution |
| `send` | Address validation, amount validation |
| `balance` | Output formatting, error handling |
| `pay` | MPP gateway integration, error handling |
| `exchange` | Swap routing, slippage validation |
| `lock` / `unlock` | Session management |

### CC-2 — On-Chain Transaction History (P1) ✅

Real on-chain transaction history replaces fragile client-side balance-diffing:

- `/api/history` route queries `FromAddress` + `ToAddress` via `queryTransactionBlocks`
- Parses `BalanceChanges` with action classification (send, receive, lending, swap, contract)
- Direction logic: outflows-only = out, inflows-only = in, both = swap
- `transaction-history` feed type with collapsible card (5 shown, expand toggle)
- "Received funds" smart card polls `/api/history` every 60s for recent incoming transfers
- Independent error handling per query (ToAddress failure doesn't kill FromAddress results)
- History chip + smart card "View history" both wire to `fetchHistory()`

### CC-3 — Clean Up `Ed25519Keypair` Debt (P2)

Several files bypass the `TransactionSigner` interface and use `Ed25519Keypair` directly. This is tech debt that should be cleaned up regardless of any future signer changes.

| # | File | Issue | Fix |
|---|------|-------|-----|
| G1 | `mpp-sui/src/client.ts` | `SuiChargeOptions.signer: Ed25519Keypair` | Accept `TransactionSigner` |
| G2 | `sdk/src/t2000.ts` | Fragile cast in `pay()` | Use `execute` callback |
| G3 | `sdk/src/protocols/cetus.ts` | `executeSwap` bypasses signer | Delete; use `buildSwapTx` + `executeWithGas` |
| G4 | `sdk/src/protocols/navi.ts` | Direct keypair paths | Route through `executeWithGas` |
| G6 | `sdk/src/wallet/send.ts` | `buildAndExecuteSend` uses keypair | Remove; use `buildSendTx` + `executeWithGas` |

After cleanup, adding any future signer type (OWS, hardware wallet, multi-sig) is just implementing the `TransactionSigner` interface — no other changes needed.

### CC-4 — Polish CLI + MCP Experience (P2)

- Init wizard: ensure it handles edge cases (existing wallet, failed setup, re-init)
- Help text: every command should have clear examples
- Error messages: map common errors to human-readable messages with suggested actions
- MCP tool descriptions: ensure they're agent-friendly and well-documented

### Cross-Cutting Summary

| Priority | Item | Blocking? | Est. | Status |
|----------|------|-----------|------|--------|
| **CC-1** | CLI unit tests | Blocks future CLI work | 2-3 days | ✅ (29 tests: output, send parsing, config helpers) |
| **CC-2** | On-chain transaction history | Blocks reliable "received funds" | 1-2 days | ✅ |
| **CC-3** | Keypair debt cleanup | No, but good hygiene | 1-2 days | ✅ |
| **CC-4** | CLI + MCP polish | No | 1 day | ✅ (help examples added) |

---

## Phase 9: Post-Beta Polish & Hardening

> Everything below is post-beta. Tracked here so nothing gets lost.

### POL-1 — Sentinels Chip Flow (Gap 7) — Removed (POL-14)

Sui Sentinel integration was removed. See POL-14.

| Item | Detail |
|------|--------|
| Status | Removed (POL-14) |

---

### POL-2 — Update Existing Unit Tests for P5-P9 Changes

The new P5-P9 code added logic to `intent-parser.ts`, `useChipFlow.ts`, and `service-gateway.ts` without updating their test files. These are pure functions / state machines — high ROI, quick to write.

| File | What to update | Est. |
|------|---------------|------|
| `intent-parser.test.ts` | Add cases for service intent fuzzy matching ("uber eats" → `reloadly-giftcard`, "search web" → `tavily-search`, etc.) | 15 min |
| `useChipFlow.test.ts` | Add transitions for `asset-select` → `l2-chips`, `quoting` → `confirming`, `selectAsset()` for invest/swap, `setQuoting()`, `setQuote()` | 20 min |
| `service-gateway.ts` (**new test**) | `getGatewayMapping` returns correct mapping for each service ID, `transformBody` produces correct request shape, unknown service → `null` | 10 min |

**What NOT to test (low ROI at this stage):**
- API routes (`/api/llm`, `/api/quote`, `/api/services/*`) — thin glue code calling external services. Mocking Enoki + Cetus + LLM is high effort, breaks on any API change. Manual browser testing catches issues faster.
- React components (`AssetSelector`, `GiftCardGrid`) — UI components are better validated by manual testing during iteration. Revisit when UI stabilizes.
- Playwright E2E — 2-3 days to write, slow to run, brittle on UI changes. Not worth it for a solo dev iterating on beta. Revisit for production launch with a team.

| Priority | Medium — keeps existing test suite honest |
|----------|-------------------------------------------|
| Est. | 45 min |
| Status | ✅ |

---

### POL-3 — Performance Pass

| Area | Issue | Fix |
|------|-------|-----|
| Bundle size | `mppx` and `@t2000/mpp-sui` added to client bundle via `useAgent` | Verify they're only imported in API routes (server-side). If leaking to client, use dynamic imports. |
| Quote latency | `/api/quote` calls Cetus aggregator which can be slow (~2-5s) | Add response caching (60s TTL) for same pair/amount. Show skeleton/spinner during fetch. |
| Balance polling | `useBalance` refetches every 30s even when tab is background | Set `refetchIntervalInBackground: false` (may already be set — verify). |
| CetusAdapter init | `initSync` called on every cold start per API route | Already using singleton pattern — verify it persists across Vercel serverless invocations (it won't in serverless — consider edge caching). |
| LLM latency | `/api/llm` waits for full LLM response before returning | Consider streaming responses with `ReadableStream` for perceived speed. |
| First load | Dashboard fetches balance, positions, rates, and history in parallel | Verify all queries fire in parallel, not waterfall. |

| Priority | Medium |
|----------|--------|
| Est. | 1-2 days |
| Status | ✅ |

---

### POL-4 — Swap Cap for Non-USDC Source Assets

**Known limitation:** `capForFlow('swap')` always returns `bal.checking` (USDC balance) even when the user selects a non-USDC source asset (e.g., swapping SUI → USDC). The on-chain validation prevents actual overspend, but the UI amount presets and cap are incorrect.

**Fix:**
1. Extend `useBalance` to track per-asset balances (SUI, USDC, wBTC, wETH)
2. `capForFlow` reads `chipFlow.state.asset` to determine the source asset and returns the corresponding balance
3. Update `getAmountPresets` to use the correct cap

| Priority | Medium — edge case but causes confusing UX for non-USDC swaps |
|----------|---------------------------------------------------------------|
| Est. | 2-3h |
| Status | ✅ (already implemented in trade unification) |

---

### POL-5 — Type Hygiene: Async Service Submit

`ServicesPanel.onServiceSubmit` is typed as `(service, values) => void` but receives an async handler. TypeScript allows this (promises are discarded), but it hides potential unhandled rejections.

**Fix:** Change prop type to `(service: ServiceItem, values: Record<string, string>) => void | Promise<void>` in `ServicesPanel.tsx`.

| Priority | Low — cosmetic, errors are caught internally |
|----------|----------------------------------------------|
| Est. | 5 min |
| Status | ✅ |

---

### POL-6 — LLM Streaming Responses

Current `/api/llm` returns the full response after the LLM finishes generating. For longer responses this adds perceived latency.

**Fix:** Use Server-Sent Events or `ReadableStream` to stream tokens to the client as they arrive. Update `useLlm` to consume the stream and render incrementally.

| Priority | Low — responses are capped at 300 tokens, latency is acceptable |
|----------|---------------------------------------------------------------|
| Est. | 3-4h |
| Status | ✅ |

---

### POL-7 — Robust Service Price Sync

Gift card dynamic pricing is calculated independently on client (`GiftCardGrid`) and server (`services/prepare`). Both use `faceValue * 0.05` today, but if the fee logic changes in one place, they'll diverge.

**Fix:** Move price calculation to a shared utility imported by both client and server. Or have the client call a `/api/services/price` endpoint to get the canonical price before showing confirmation.

| Priority | Low — both sides use identical logic today |
|----------|---------------------------------------------|
| Est. | 1h |
| Status | ✅ |

---

### POL-8 — Error Recovery UX for Services

If a service payment transaction succeeds but the MPP gateway call fails (network error, gateway down), the user has paid but received no service. Currently shows a generic error.

**Fix:**
1. Log the `paymentDigest` in the error response so the user has proof of payment
2. Show a "Payment sent but service failed — contact support with tx [digest]" message
3. Consider a retry mechanism that re-uses the existing payment credential

| Priority | Medium — real money at stake |
|----------|------------------------------|
| Est. | 2-3h |
| Status | ✅ |

---

### POL-9 — Accessibility Pass

| Item | Status |
|------|--------|
| Keyboard navigation for all chip flows | ✅ |
| Screen reader labels on interactive elements | ✅ |
| Focus management in slide-over panels (settings, services) | ✅ |
| Color contrast ratio ≥ 4.5:1 for all text on dark bg | ✅ (muted→#7b8494 5.43:1, dim→#596170 3.29:1 AA-large, accent #00d68f 10.7:1) |
| `aria-live` regions for feed updates | ✅ |

| Priority | Medium — important for production |
|----------|----------------------------------|
| Est. | 1 day |
| Status | ✅ |

---

### POL-10 — Security Hardening

| Item | Detail |
|------|--------|
| Rate limiting on `/api/llm` | Prevent abuse of LLM API key. Add per-user rate limit (e.g., 20 queries/hour). |
| Rate limiting on `/api/services/prepare` | Prevent spam transactions. Tie to zkLogin JWT identity. |
| Input sanitization in service forms | `SmartForm` values pass through to gateway — sanitize for injection. |
| CSP audit | Verify all external domains in CSP after adding mppx, Cetus, etc. |
| SafeguardEnforcer enforcement | Currently limits are stored in localStorage but not enforced in `handleConfirm`. Wire them up. |
| JWT validation on API routes | Some routes accept `x-zklogin-jwt` but don't validate it. Add server-side JWT verification. |

| Priority | High for production, medium for beta |
|----------|--------------------------------------|
| Est. | 1-2 days |
| Status | ✅ |

---

### Post-Beta Summary

| ID | Item | Priority | Est. | Status |
|----|------|----------|------|--------|
| **POL-1** | Sentinels chip flow | — | — | Removed (POL-14) |
| **POL-2** | Update existing unit tests for P5-P9 | Medium | 45 min | ✅ |
| **POL-3** | Performance pass | Medium | 1-2 days | ✅ |
| **POL-4** | Swap cap for non-USDC assets | Medium | 2-3h | ✅ (already implemented) |
| **POL-5** | Async service submit type | Low | 5 min | ✅ |
| **POL-6** | LLM streaming responses | Low | 3-4h | ✅ |
| **POL-7** | Shared service price logic | Low | 1h | ✅ |
| **POL-8** | Service payment error recovery | Medium | 2-3h | ✅ |
| **POL-9** | Accessibility pass | Medium | 1 day | ✅ |
| **POL-10** | Security hardening | High (prod) | 1-2 days | ✅ |
| **POL-11** | DCA & investment strategies chip flow | Medium | 1-2 days | ✅ |

---

### POL-11 — DCA & Investment Strategies Chip Flow

The SDK already has `DEFAULT_STRATEGIES` (bluechip, layer1, sui-heavy) in `constants.ts` and an `auto-invest.ts` module with allocation logic. These aren't wired to the web app.

**New chip flow: `[DCA]` or `[Strategies]`**

```
[Invest] → "How do you want to invest?"
→ [One-time buy]  [DCA strategy]
→ user taps [DCA strategy]
→ [Bluechip (BTC 50%, ETH 30%, SUI 20%)]
  [Layer 1 (ETH 50%, SUI 50%)]
  [Sui-Heavy (BTC 20%, ETH 20%, SUI 60%)]
  [Custom]
→ user taps [Bluechip]
→ "Invest $X/week into Bluechip portfolio"
→ [$10/wk] [$25/wk] [$50/wk] [Custom]
→ confirmation card with allocation breakdown
```

**Implementation:**
1. Extend `useChipFlow` with a `strategy-select` phase
2. New `StrategySelector` component showing allocation pie/bars
3. New `DcaSchedule` component for frequency + amount
4. Schedule storage in `localStorage` (or server-side via preferences API)
5. Background execution: either cron-triggered API route or client-side polling when app is open
6. Wire to SDK `auto-invest.ts` allocation + `CetusAdapter.buildSwapTx` for each asset

**Dependencies:** Invest flow working (UX-11 ✅), CetusAdapter multi-asset swaps

| Priority | Medium — differentiating feature |
|----------|----------------------------------|
| Est. | 1-2 days |
| Status | ✅ |

---

### POL-12: Trade Unification Refactor (invest → swap)

**Goal:** Remove the broken "invest buy/sell" concept. Swap is the universal primitive for all token exchanges. "Invest" is reserved for strategy baskets (future). Consistent across SDK, CLI, and web app.

**Rationale:**
- Web app "invest" was a Cetus swap with no portfolio tracking, no sell flow, no balance display — half-baked
- SDK `investBuy`/`investSell` lock tokens via client-side `portfolio.json` — fragile, gets out of sync
- Two different names (invest vs exchange/swap) for the same on-chain operation creates user confusion
- "Swap" is DeFi jargon; user-facing UX should support "buy" and "sell" as natural aliases

**Architecture (after):**

```
User Actions:  Save · Borrow · Trade · Earn · Pay

Trade covers:
  buy 100 BTC      → swap(USDC, BTC, 100)   → "Bought 0.001 BTC"
  sell 0.001 BTC   → swap(BTC, USDC, 0.001)  → "Sold 0.001 BTC for $95"
  swap 10 SUI ETH  → swap(SUI, ETH, 10)      → "Swapped 10 SUI → 0.004 ETH"

All three are the same swap() call. Different UX framing based on intent.
```

**Command mapping (after):**

| Action | SDK method | CLI | Web app |
|--------|-----------|-----|---------|
| Trade tokens | `swap()` | `swap 100 USDC BTC` | Trade/Swap chip |
| Buy shorthand | `swap()` | `buy 100 BTC` | "buy $100 of BTC" intent |
| Sell shorthand | `swap()` | `sell 0.001 BTC` | "sell my BTC" intent |
| Strategy basket | `investStrategy()` | `invest strategy buy bluechip 200` | Future |
| Earn yield | `earn()` | `earn BTC` | Future |
| Rebalance yield | `rebalance()` | `earn rebalance` | Future (NAVI + Suilend) |
| DCA schedule | `autoInvest()` | `auto setup 50 weekly BTC` | Future |

**What's removed:**
- `investBuy()` / `investSell()` — deprecated, alias to `swap()`
- Investment locking (`_bypassInvestmentGuard` in `exchange()`)
- `PortfolioManager` enforcement (tracking becomes informational only)
- Separate "invest" chip in web app
- Duplicate `invest` case in `transactions/prepare/route.ts`

**Phase 1 — SDK (foundation):**
1. Rename `exchange()` → `swap()`, keep `exchange()` as deprecated alias
2. Remove `_bypassInvestmentGuard` check from `swap()`
3. Deprecate `investBuy`/`investSell` (internally call `swap()`, keep portfolio recording as informational)
4. Update error codes: remove `INVESTMENT_LOCKED` throws
5. Update tests that assert `INVESTMENT_LOCKED`

**Phase 2 — CLI (commands):**
1. Add `swap <amount> <from> <to>` command (copy from `exchange`, rename)
2. Add `buy <amount> <asset>` shorthand (swap USDC → asset, amount in USD)
3. Add `sell <amount|all> <asset>` shorthand (swap asset → USDC)
4. Deprecate `invest buy`/`invest sell` (print "use `buy`/`sell` or `swap` instead", still works)
5. Deprecate `exchange` (print "use `swap` instead", still works)
6. Rename `invest earn/unearn/rebalance` → `earn/unearn` top-level (keep `invest earn` as alias)

**Phase 3 — Web app (UI):**
1. Remove invest chip from `ChipBar.tsx`
2. Rename swap chip label context-aware: "Buy" when USDC→asset, "Sell" when asset→USDC, "Swap" otherwise
3. Merge `INVEST_ASSETS` into `SWAP_ASSETS` in `AssetSelector.tsx` (add GOLD, remove invest flow distinction)
4. Update intent parser: "buy BTC" → `{ action: 'swap', from: 'USDC', to: 'BTC' }`, "sell BTC" → `{ action: 'swap', from: 'BTC', to: 'USDC' }`
5. Remove `'invest'` case from `transactions/prepare/route.ts` (swap handles it)
6. Remove `invest()` from `useAgent.ts` SDK wrapper
7. Update `handleConfirm`, `getConfirmationDetails`, `capForFlow` — remove invest branches
8. Show ALL token balances: use `client.getAllBalances()` in `useBalance.ts`, map coin types → names/prices
9. Fix precision: store raw on-chain balances alongside display values, "All" uses raw amount
10. Update confirmation copy: "Bought X BTC" / "Sold X BTC" / "Swapped X SUI → Y ETH"

**Scalability:**
- Adding a new asset: add coin type to `ASSET_COIN_TYPES` + `SWAP_ASSETS`. One-line additions.
- Adding strategies later: `invest strategy buy` uses multi-swap PTB, builds on `swap()` primitive
- Adding earn for new tokens: register lending adapter in registry, `earn` auto-discovers best rate (NAVI + Suilend)

| Priority | High — fixes critical UX bugs + consistency |
|----------|---------------------------------------------|
| Est. | 1-2 days |
| Status | 🔄 In progress |

---

### POL-13: Multi-Protocol DeFi Support (NAVI + Suilend + Rebalance)

**Goal:** Wire the SDK's existing multi-protocol DeFi support (ProtocolRegistry, SuilendAdapter, rebalance) into the web-app. Currently the web-app only uses NAVI for lending — this phase makes rates, positions, and transactions work across all registered protocols. See `T2000_V3_SPEC.md` → "Multi-Protocol DeFi Support — Gap Analysis" for context.

**Why now:** The "Better rate" smart card and `get_rates` agent tool claim to compare across protocols, but the data is NAVI-only. This is misleading and blocks the yield optimization UX that's core to the product.

**Architecture decision:** Use the SDK's `ProtocolRegistry` as the single source of truth for multi-protocol aggregation. Don't duplicate rate-comparison or position-merging logic in the web-app API routes. Create a shared singleton registry on the server side, register NAVI + Suilend + Cetus, and use its methods directly.

---

#### Task 13.1 — Shared ProtocolRegistry singleton for API routes

**Problem:** Each API route (`/api/rates`, `/api/positions`, `/api/transactions/prepare`) independently creates adapter singletons. There's no shared registry to aggregate across protocols.

**Changes:**

```
apps/web-app/lib/protocol-registry.ts (NEW)
```

Create a server-side singleton that:
1. Instantiates `NaviAdapter`, `SuilendAdapter`, `CetusAdapter`
2. Registers them in a `ProtocolRegistry`
3. Exports the registry and individual adapters for direct access
4. Handles lazy initialization (Suilend's `SuilendClient.initialize()` runs on first use)
5. Caches across Vercel serverless invocations (same global singleton pattern as Prisma)

```typescript
import { ProtocolRegistry, NaviAdapter, SuilendAdapter, CetusAdapter } from '@t2000/sdk/adapters';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

const globalForRegistry = globalThis as unknown as { registry: ProtocolRegistry };

export function getRegistry(): ProtocolRegistry {
  if (globalForRegistry.registry) return globalForRegistry.registry;

  const client = new SuiClient({ url: getFullnodeUrl(network) });
  const registry = new ProtocolRegistry();

  const navi = new NaviAdapter();
  navi.initSync(client);
  registry.registerLending(navi);

  const suilend = new SuilendAdapter();
  suilend.initSync(client);
  registry.registerLending(suilend);

  const cetus = new CetusAdapter();
  cetus.initSync(client);
  registry.registerSwap(cetus);

  globalForRegistry.registry = registry;
  return registry;
}
```

**Gotchas:**
- Suilend's first `getRates()`/`getPositions()` call triggers `SuilendClient.initialize()` which fetches Pyth oracle data — adds ~1-3s latency on cold start. Subsequent calls are fast.
- Suilend's Pyth dependency may log console noise. The SDK already has `quietSuilend()` to suppress this.
- Verify `@suilend/sdk` is bundled with the web-app build (check `node_modules` resolution in monorepo).

| Est. | 30 min |
|------|--------|
| Status | ✅ Done |

---

#### Task 13.2 — Update `/api/rates` to aggregate all protocols

**Problem:** Currently imports only `NaviAdapter` and returns NAVI USDC rates. `bestSaveRate` is always NAVI.

**Changes to `apps/web-app/app/api/rates/route.ts`:**

1. Replace standalone `NaviAdapter` with `getRegistry()` from Task 13.1
2. Call `registry.allRates('USDC')` instead of `navi.getRates('USDC')`
3. Flatten the response to match existing shape (backward-compat):

```typescript
// registry.allRates('USDC') returns:
//   [{ protocol: 'NAVI', protocolId: 'navi', rates: { asset: 'USDC', saveApy: 3.9, borrowApy: 5.1 } }, ...]
// Flatten to existing shape:
const rates = allRates.map(r => ({
  protocol: r.protocol,
  protocolId: r.protocolId,
  asset: r.rates.asset,
  saveApy: r.rates.saveApy,
  borrowApy: r.rates.borrowApy,
}));
```

4. Compute `bestSaveRate` from the flattened array (highest `saveApy`), keep shape `{ protocol, rate }`
5. Keep 30s in-memory cache (same pattern)
6. Handle Suilend init failure gracefully — registry's `allRates` already swallows per-adapter errors

**Response shape (backward-compatible + new fields):**
```json
{
  "rates": [
    { "protocol": "NAVI", "protocolId": "navi", "asset": "USDC", "saveApy": 3.9, "borrowApy": 5.1 },
    { "protocol": "Suilend", "protocolId": "suilend", "asset": "USDC", "saveApy": 4.2, "borrowApy": 4.8 }
  ],
  "bestSaveRate": { "protocol": "Suilend", "rate": 4.2 }
}
```

**Downstream effects:**
- `useBalance` only reads `bestSaveRate` — shape unchanged, no breakage
- Smart cards `bestAlternativeRate` — populated from `bestSaveRate`, now reflects true best across protocols
- Agent `get_rates` tool — returns accurate multi-protocol data automatically

| Est. | 45 min |
|------|--------|
| Depends on | 13.1 |
| Status | ✅ Done |

---

#### Task 13.3 — Update `/api/positions` to aggregate all protocols

**Problem:** Currently imports only `NaviAdapter`. Users with Suilend positions won't see them. Health factor is NAVI-only.

**Changes to `apps/web-app/app/api/positions/route.ts`:**

1. Replace standalone `NaviAdapter` with `getRegistry()`
2. Call `registry.allPositions(address)` — returns `[{ protocol, protocolId, positions: { supplies, borrows } }]`
3. **Flatten and aggregate** into the existing response shape (backward-compat):

```typescript
// Aggregate supplies across protocols, tag each with protocol
const allSupplies = allPositions.flatMap(p =>
  p.positions.supplies.map(s => ({ ...s, protocol: p.protocol, protocolId: p.protocolId }))
);
const allBorrows = allPositions.flatMap(p =>
  p.positions.borrows.map(b => ({ ...b, protocol: p.protocol, protocolId: p.protocolId }))
);
const savings = allSupplies.reduce((sum, s) => sum + (s.amountUsd ?? s.amount), 0);
const borrows = allBorrows.reduce((sum, b) => sum + (b.amountUsd ?? b.amount), 0);
```

4. **`savingsRate`:** Weighted average of supply APYs by USD amount. This feeds `currentRate` in smart cards:
```typescript
const savingsRate = savings > 0
  ? allSupplies.reduce((sum, s) => sum + s.apy * (s.amountUsd ?? s.amount), 0) / savings
  : 0;
```

5. **Health factor:** `getHealth()` is NOT returned by `allPositions` — must call separately on each adapter. Use **minimum** HF (most at-risk):
```typescript
const healths = await Promise.allSettled(
  registry.listLending().map(a => a.getHealth(address))
);
const validHFs = healths
  .filter(h => h.status === 'fulfilled' && h.value.healthFactor !== Infinity)
  .map(h => h.value);
const healthFactor = validHFs.length > 0
  ? Math.min(...validHFs.map(h => h.healthFactor))
  : null;
const maxBorrow = validHFs.reduce((sum, h) => sum + h.maxBorrow, 0);
```

6. **Pending rewards:** Call `getPendingRewards()` on each adapter, sum amounts:
```typescript
const allRewards = await Promise.allSettled(
  registry.listLending().filter(a => a.getPendingRewards).map(a => a.getPendingRewards!(address))
);
const pendingRewards = allRewards
  .filter(r => r.status === 'fulfilled')
  .flatMap(r => r.value)
  .reduce((sum, r) => sum + r.estimatedValueUsd, 0);
```

7. **New fields** in response (additive, no breaking changes):
```json
{
  "savings": 7.80,
  "borrows": 0.004,
  "savingsRate": 4.05,
  "healthFactor": null,
  "maxBorrow": 3.0,
  "pendingRewards": 0.01,
  "supplies": [
    { "asset": "USDC", "amount": 2.80, "amountUsd": 2.80, "apy": 3.9, "protocol": "NAVI", "protocolId": "navi" },
    { "asset": "USDC", "amount": 5.00, "amountUsd": 5.00, "apy": 4.2, "protocol": "Suilend", "protocolId": "suilend" }
  ],
  "borrows_detail": [
    { "asset": "USDC", "amount": 0.004, "amountUsd": 0.004, "apy": 5.1, "protocol": "NAVI", "protocolId": "navi" }
  ]
}
```

**Gotchas:**
- `savingsRate` as weighted average ensures smart cards' `currentRate` accurately reflects the user's blended rate, so "Better rate" card only fires when a single protocol genuinely beats the blend
- Suilend `getPendingRewards()` returns `amount: 0, estimatedValueUsd: 0` until Part B of Task 13.10 fixes it
- Suilend multi-obligation users: SDK reads first obligation — acceptable for v1
- `allPositions` swallows individual adapter errors; partial results returned
- Error path (all adapters fail): return existing zero-defaults — backward-compat

| Est. | 1.5 hours |
|------|-----------|
| Depends on | 13.1 |
| Status | ✅ Done |

---

#### Task 13.4 — Protocol-aware transactions in `/api/transactions/prepare`

**Problem:** Save, withdraw, borrow, repay all hardcode `NaviAdapter`. If a user has savings on Suilend, "withdraw all" would try to withdraw from NAVI (wrong protocol).

**Full plumbing chain (4 files):**

**A. `apps/web-app/app/api/transactions/prepare/route.ts`:**

1. Add `protocol?: 'navi' | 'suilend'` to `BuildRequest` interface
2. For `save`/`withdraw`/`borrow`/`repay`: resolve adapter via `getRegistry().getLending(protocol ?? 'navi')`
3. Remove standalone `getNaviAdapter()` / `getCetusAdapter()` singletons — use `getRegistry()` for all
4. Default to `'navi'` for backward compatibility

**B. `apps/web-app/hooks/useAgent.ts` — `sponsoredTransaction`:**

Currently sends: `{ type, address, amount, ...params }`. Add `protocol` to the params object:

```typescript
// Before: body: JSON.stringify({ type: txType, address, ...params })
// After:  body: JSON.stringify({ type: txType, address, ...params })
// params already spreads — just ensure callers pass { protocol } when relevant
```

The `sdk.save(amount, protocol?)`, `sdk.withdraw(amount, protocol?)` etc. wrappers need to accept and forward `protocol`.

**C. `apps/web-app/app/dashboard/page.tsx` — `handleConfirm`:**

Currently calls `sdk.save(amount)`. Extend to pass protocol:

- **Save:** Use `balance.bestSaveRate?.protocolId ?? 'navi'` as the target (save to best-rate protocol)
- **Withdraw:** Protocol must come from the flow context — user clicked on a specific protocol's position, or "all" means withdraw from where they have savings
- **Borrow/Repay:** Same — from position data

**D. `chipFlow` state — carry `protocol` through the flow:**

The flow state machine needs a `protocol` field so that when the user starts a withdraw/repay from a specific protocol's position, the confirmation screen knows which adapter to use.

**Design decision — multi-protocol "withdraw all" / "repay all":**

For v1, keep it simple:
- **Save:** Always save to `bestSaveRate.protocolId` (best rate). Single protocol per tx.
- **Withdraw all:** If user has savings on ONE protocol → withdraw from that protocol. If on MULTIPLE protocols → withdraw from the one with the **most** savings (or the one with the lower rate, since that's the one you'd want to exit). Show protocol name in confirmation: "Withdraw $2.80 from NAVI".
- **Repay all:** Repay on the protocol where the user has borrows. If borrows on multiple → repay the one with the **highest** borrow APY first (most expensive debt).
- **Borrow:** Borrow from the protocol with the **lowest** borrow rate (if user has collateral there). Block borrow on Suilend if `supportsSameAssetBorrow: false` and user only has USDC collateral.

This avoids multi-protocol PTB complexity while still routing to the right place.

**Gotchas:**
- **Enoki `allowedMoveCallTargets`**: Suilend packages must be allowed (see Task 13.7)
- **`supportsSameAssetBorrow: false`**: Suilend doesn't support borrowing the same asset you supply — borrow flow must check this and either fallback to NAVI or show a clear message
- **`sponsored` option**: Verify `onlyTransactionKind: true` builds work with Suilend's PTB output
- **Flow context propagation**: `chipFlow.startFlow('withdraw', { protocol: 'suilend' })` — verify the flow context object is preserved through selectAmount → confirm

| Est. | 2 hours |
|------|---------|
| Depends on | 13.1, 13.3 (needs position data with protocol labels) |
| Status | ✅ Done |

---

#### Task 13.5 — Add `rebalance` transaction type

**Problem:** The SDK's `T2000.rebalance()` composes withdraw → swap → deposit into a single PTB, but this isn't exposed via any web-app route.

**Changes to `apps/web-app/app/api/transactions/prepare/route.ts`:**

1. Add `'rebalance'` to `TxType` union
2. Accept `fromProtocol`, `toProtocol`, `asset`, `amount` in request body
3. Build composed PTB: `addWithdrawToTx` → (optional `addSwapToTx`) → `addSaveToTx`
4. Both NAVI and Suilend implement `addWithdrawToTx` / `addSaveToTx` — coin piping works across adapters

**Gotchas:**
- Health factor check: if user has borrows on source protocol, withdrawing may drop HF. Call `maxWithdraw` to get the safe amount.
- Break-even for cross-asset swaps: SDK calculates this — surface in confirmation card.
- Fee collection: `collectFee: true` when depositing USDC (protocol fee).

| Est. | 2 hours |
|------|---------|
| Depends on | 13.1, 13.4 |
| Status | ✅ Done |

---

#### Task 13.6 — Update agent `get_rates` tool description

**Problem:** Agent tool description says "NAVI, Suilend, etc." but was returning NAVI-only data. After Task 13.2, data is correct — verify response shape matches LLM expectations.

**Changes:**
- Verify `get_rates` tool description in `agent-tools.ts` is accurate
- Update system prompt if needed — agent should recommend protocol by name
- `get_rates` handler in `/api/agent/tool/route.ts` calls `/api/rates` — no code change needed after 13.2

| Est. | 15 min |
|------|--------|
| Depends on | 13.2 |
| Status | ✅ Done |

---

#### Task 13.7 — Enoki allowlist update for Suilend

**Problem:** Enoki sponsored transactions may be restricted to known Move call targets.

**Changes (Enoki Portal, not code):**
1. Get Suilend's Move package addresses from `SuilendAdapter.descriptor`
2. Add to Enoki's `allowedMoveCallTargets` in Enoki Portal dashboard
3. Test: execute a Suilend save transaction to verify sponsorship works

**If Enoki is unrestricted (no allowlist):** No-op — just verify with a test transaction.

| Est. | 15 min |
|------|--------|
| Depends on | 13.4 |
| Status | ✅ Done — Enoki allowlist is dynamic via `extractMoveCallTargets()`, no static config needed |

---

#### Task 13.8 — Update `useBalance` hook + `BalanceHeader` for multi-protocol positions

**Problem:** After Task 13.3, positions include protocol labels. UI should surface per-protocol savings breakdown. Also: `bestAlternativeRate` vs `currentRate` data flow needs fixing for smart cards.

**Changes to `hooks/useBalance.ts`:**

1. Parse new `protocol`/`protocolId` fields from `/api/positions` response's `supplies` array
2. Expose per-protocol savings breakdown:
```typescript
// New fields on BalanceData:
savingsBreakdown: Array<{ protocol: string; protocolId: string; amount: number; apy: number }>;
borrowsBreakdown: Array<{ protocol: string; protocolId: string; amount: number; apy: number }>;
```
3. `balance.savings` total remains the sum across all protocols (backward-compat)

4. **Critical: fix `bestAlternativeRate` logic.** Currently `useBalance` returns `bestSaveRate` directly from `/api/rates`. The dashboard maps this to `AccountState.bestAlternativeRate` for smart cards. But after multi-protocol, `bestSaveRate` might be the SAME protocol the user is already on.

   Fix: compare `bestSaveRate.protocolId` against the user's primary savings protocol. If same → `bestAlternativeRate = undefined` (no alternative). If different → `bestAlternativeRate = bestSaveRate`.

```typescript
// Determine user's primary savings protocol (the one with the most savings $)
const primaryProtocol = savingsBreakdown.length > 0
  ? savingsBreakdown.reduce((a, b) => a.amount > b.amount ? a : b)
  : null;

// bestAlternativeRate: only set if best rate is on a DIFFERENT protocol than user's primary
const bestAlternativeRate = ratesData.bestSaveRate &&
  primaryProtocol &&
  ratesData.bestSaveRate.protocolId !== primaryProtocol.protocolId
    ? ratesData.bestSaveRate
    : null;

// currentRate: the user's primary protocol rate (from positions, not from rates API)
const currentRate = primaryProtocol?.apy ?? posData.savingsRate;
```

5. Update `BalanceData` return type with new fields: `savingsBreakdown`, `borrowsBreakdown`, `bestAlternativeRate` (refined), `currentRate`

**Changes to `BalanceHeader.tsx`:**
- Expanded detail shows: "Savings: NAVI $2.80 (3.9%) · Suilend $5.00 (4.2%)"
- If savings on only one protocol, show just the single line

**Changes to `dashboard/page.tsx` — `AccountState` construction:**
- Map `balance.bestAlternativeRate` → `AccountState.bestAlternativeRate`
- Map `balance.currentRate` → `AccountState.currentRate`
- This ensures smart cards fire correctly: only when a genuinely different protocol offers a better rate

**Gotchas:**
- `savingsBreakdown` may be empty if positions API returns zero-defaults (error path) — handle gracefully
- `bestSaveRate` from rates API needs `protocolId` field (added in Task 13.2 response shape)
- Smart cards `AccountState` type is called `AccountState` (not `SmartCardState`) — exported from `smart-cards.ts`

| Est. | 1 hour |
|------|--------|
| Depends on | 13.2, 13.3 |
| Status | ✅ Done |

---

#### Task 13.9 — Wire [Switch] smart card action to rebalance flow

**Problem:** "Better rate" smart card's [Switch] action shows manual guidance text. Should trigger atomic rebalance.

**Changes to `apps/web-app/app/dashboard/page.tsx`:**
1. Replace `rebalance` flow's text guidance with a confirmation card
2. Confirmation shows: "Move $X from NAVI (3.9%) to Suilend (4.2%). Est. +$Y/mo."
3. On confirm: call `/api/transactions/prepare` with `type: 'rebalance'`
4. Execute via Enoki sponsored flow

| Est. | 1 hour |
|------|--------|
| Depends on | 13.5, 13.8 |
| Status | ✅ Done |

---

#### Task 13.10 — Multi-protocol claim rewards + fix Suilend pending reward display

**Problem (A — Claim):** `claim-rewards` in `/api/transactions/prepare` only calls `navi.addClaimRewardsToTx()`. Users with rewards on Suilend can't claim them. The 🏆 rewards smart card and contextual chip show the combined total (after Task 13.3), but the claim transaction only sweeps NAVI.

**Problem (B — Display):** `SuilendAdapter.getPendingRewards()` returns `amount: 0` and `estimatedValueUsd: 0` for every reward — hardcoded placeholders. The data to compute exact claimable amounts already exists in the Suilend SDK's `obligation.original.userRewardManagers[].rewards[].earnedRewards` field, we just didn't read it. Without this fix the rewards card would show `$0.00` for Suilend rewards even when real amounts are claimable.

**Current state:**
- Dashboard `claim-rewards` flow calls `sdk.claimRewards()` → the SDK already iterates all registry adapters (multi-protocol)
- Prepare route: `navi.addClaimRewardsToTx(tx, address)` — **hardcoded NAVI**
- Suilend's `addClaimRewardsToTx` exists in the SDK and works — calls `sdk.claimRewardsAndSendToUser()` with correct Move instructions
- Suilend's `getPendingRewards` already calls `initializeObligations()` which returns `userRewardManagers` with `earnedRewards` — the data is fetched but not used
- `/api/positions` only calls NAVI's `getPendingRewards()` — fixed by Task 13.3

**Part A — Changes to `apps/web-app/app/api/transactions/prepare/route.ts`:**

1. Replace NAVI-only claim with multi-protocol claim:

```typescript
case 'claim-rewards': {
  const registry = getRegistry();
  let totalClaimed = 0;
  
  for (const adapter of registry.listLending()) {
    if (!adapter.addClaimRewardsToTx) continue;
    try {
      const claimed = await adapter.addClaimRewardsToTx(tx, address);
      totalClaimed += claimed.length;
    } catch {
      // Skip protocols with no claimable rewards — don't fail the whole tx
    }
  }
  
  if (totalClaimed === 0) {
    throw new Error('No rewards available to claim');
  }
  break;
}
```

2. The smart card reward amount is already correct after Task 13.3 (aggregates across protocols)
3. Dashboard `claimRewards()` in `useAgent.ts` — verify the SDK method already uses the registry. If it does, it claims from all protocols. If not, the prepare route above handles it.

**Part B — Fix `packages/sdk/src/adapters/suilend.ts` `getPendingRewards()`:**

The Suilend SDK computes `claimableAmount` in `lib/liquidityMining.js` → `getObligationClaim()`:
```typescript
claimableAmount = new BigNumber(userReward.earnedRewards.value.toString())
    .div(WAD)      // WAD = 10^18
    .div(10 ** poolReward.mintDecimals)
```

Apply the same formula in our adapter. The obligation data from `initializeObligations()` includes `ob.original.userRewardManagers` (the raw on-chain struct). For each deposit's pool reward, find the matching `userRewardManager` and read its `rewards[rewardIndex].earnedRewards`:

```typescript
async getPendingRewards(address: string): Promise<PendingReward[]> {
  // ... existing init code ...
  const ob = obligations[0];
  const rewards: PendingReward[] = [];
  const WAD = 1e18;

  for (const dep of ob.deposits) {
    // Find the userRewardManager for this deposit's pool reward manager
    const urm = ob.original.userRewardManagers.find(
      u => u.poolRewardManagerId === dep.reserve.depositsPoolRewardManager.id
    );

    for (const rw of dep.reserve.depositsPoolRewardManager.poolRewards) {
      if (rw.endTimeMs <= Date.now()) continue;
      
      const userReward = urm?.rewards[rw.rewardIndex];
      const claimableAmount = userReward?.earnedRewards
        ? Number(BigInt(userReward.earnedRewards.value.toString())) / WAD / (10 ** rw.mintDecimals)
        : 0;

      const symbol = rw.symbol || rw.coinType.split('::').pop() || 'UNKNOWN';
      rewards.push({
        protocol: 'suilend',
        asset: this.resolveSymbol(dep.coinType),
        coinType: rw.coinType,
        symbol,
        amount: claimableAmount,
        estimatedValueUsd: 0,  // TODO: multiply by price if available
      });
    }
  }
  return rewards;
}
```

Note: `estimatedValueUsd` requires a price feed for the reward token. For now, return the raw `amount` (which is what the UI needs for "Claim X SUI" display). USD estimation can be added later if we pipe Pyth prices through.

**Gotchas:**
- `ob.original.userRewardManagers` is the raw on-chain struct — check it exists before accessing. If user has no reward managers (fresh obligation), the array may be empty.
- The `earnedRewards.value` is a `Decimal` (WAD-scaled bigint as string). Must divide by WAD (10^18) then by mint decimals.
- `addClaimRewardsToTx` already works correctly — it's only the **display** that was broken.
- Single PTB: both NAVI and Suilend add their claim instructions to the same `Transaction` object. This composes cleanly — one tx claims from all protocols.

| Est. | 45 min |
|------|--------|
| Depends on | 13.1 |
| Status | ✅ Done |

---

#### Task 13.11 — Contextual chips + agent multi-protocol awareness

**Problem:** Contextual chips and the agent need to surface protocol-specific recommendations after multi-protocol data is available.

**Current state (already partially working):**
- "Better rate" contextual chip (`contextual-chips.ts` line 83-92): already references `bestAlternativeRate.protocol` and `chipFlow: 'rebalance'` — **will auto-surface Suilend after Task 13.2 fixes the rates data**. No code change needed.
- "Better rate" smart card (`smart-cards.ts` line 109-122): already renders protocol name and rate comparison — **will auto-work after 13.2**. No code change needed.
- 🏆 Rewards smart card: already renders combined `pendingRewards` — **will show multi-protocol total after 13.3**. No code change needed.
- "Portfolio P&L" contextual chip: already sends agent prompt asking about rebalancing.

**What DOES need updating:**

1. **Agent system prompt** (`lib/agent-tools.ts`):
   - Update the `get_rates` tool description to explicitly mention it returns rates from NAVI and Suilend
   - Add a rule: "When suggesting savings actions, mention which protocol offers the best rate by name. E.g., 'Save on Suilend at 4.2%' not just 'Save'."
   - Add a rule: "When a user asks about 'best yield' or 'highest rate', call `get_rates` and compare protocols. Suggest [Switch to X] if another protocol offers > 0.3% more."

2. **Morning briefing / agent responses** (`lib/agent-tools.ts` system prompt):
   - The `get_balance` tool returns savings data — after Task 13.3/13.8, this includes per-protocol breakdown
   - Update system prompt: "When describing savings, mention which protocol(s) the user is on and their rates. E.g., 'You have $2.80 on NAVI (3.9%) and $5.00 on Suilend (4.2%).'"

3. **Intent parser** (`lib/intent-parser.ts`):
   - "best yield", "best rate", "highest yield" → should trigger agent (Tier 3) rather than being ignored
   - Verify these don't match existing patterns and correctly fall through to the agent

4. **Contextual chip for yield optimization** (`lib/contextual-chips.ts`):
   - Consider adding a new chip when user has savings on a suboptimal protocol AND no better-rate smart card is showing (e.g., if diff < 0.3% but still exists):

```typescript
// Optional: "Optimize savings" chip when savings exist on multiple protocols
if (state.savings > 0 && state.bestAlternativeRate && state.currentRate) {
  const diff = state.bestAlternativeRate.rate - state.currentRate;
  if (diff > 0 && diff <= 0.3) {
    chips.push({
      id: 'yield-info',
      icon: '💡',
      label: `Earning ${state.currentRate.toFixed(1)}% — ${state.bestAlternativeRate.rate.toFixed(1)}% available`,
      agentPrompt: 'Compare my current savings rate with the best available. Should I switch protocols?',
      priority: 30,
      dismissible: true,
    });
  }
}
```

| Est. | 45 min |
|------|--------|
| Depends on | 13.2, 13.3 |
| Status | ✅ Done |

---

#### Task 13.12 — Tests

| Test | File | What it verifies | Est. |
|------|------|-----------------|------|
| Registry singleton | `lib/protocol-registry.test.ts` (new) | Returns same instance, has NAVI + Suilend + Cetus registered | 15 min |
| `/api/rates` multi-protocol | `app/api/rates/route.test.ts` (update) | Returns rates from both protocols, `bestSaveRate` picks highest | 20 min |
| `/api/positions` multi-protocol | `app/api/positions/route.test.ts` (update) | Aggregates supplies/borrows, min HF, combined rewards | 20 min |
| Rebalance tx type | `app/api/transactions/prepare/route.test.ts` (update) | Builds composed PTB with correct protocol routing | 20 min |
| Multi-protocol claim | `app/api/transactions/prepare/route.test.ts` (update) | Claims from all protocols with rewards, skips empty | 15 min |
| Intent parser "switch" / "rebalance" | `lib/intent-parser.test.ts` (update) | "switch to suilend", "rebalance" → correct intent | 10 min |
| Contextual chips yield | `lib/contextual-chips.test.ts` (update) | "Better rate" chip uses correct protocol name when Suilend is better | 10 min |

| Est. | 2 hours total |
|------|---------------|
| Status | ✅ Done — 196 web-app + 25 SDK tests pass (6 new tests added) |

---

#### POL-13 Summary

| Task | Description | Est. | Depends on | Status |
|------|-------------|------|------------|--------|
| **13.1** | Shared `ProtocolRegistry` singleton | 30 min | — | ✅ |
| **13.2** | `/api/rates` multi-protocol (flatten shape, backward-compat) | 45 min | 13.1 | ✅ |
| **13.3** | `/api/positions` multi-protocol (aggregate, weighted rate, min HF) | 1.5 hours | 13.1 | ✅ |
| **13.4** | Protocol-aware transactions (4-file plumbing: route → useAgent → dashboard → chipFlow) | 2 hours | 13.1, 13.3 | ✅ |
| **13.5** | Rebalance transaction type | 2 hours | 13.1, 13.4 | ✅ |
| **13.6** | Agent `get_rates` tool update | 15 min | 13.2 | ✅ |
| **13.7** | Enoki allowlist for Suilend | 15 min | 13.4 | ✅ |
| **13.8** | `useBalance` + `BalanceHeader` (per-protocol breakdown, fix `bestAlternativeRate` vs `currentRate` logic) | 1 hour | 13.2, 13.3 | ✅ |
| **13.9** | Wire [Switch] to rebalance flow | 1 hour | 13.5, 13.8 | ✅ |
| **13.10** | Multi-protocol claim rewards + fix Suilend pending reward display | 45 min | 13.1 | ✅ |
| **13.11** | Contextual chips + agent protocol awareness | 45 min | 13.2, 13.3 | ✅ |
| **13.12** | Tests | 2 hours | All | ✅ |

**Total estimate:** ~12-13 hours (2.5 focused days) — **✅ COMPLETE**

**Execution order:**
1. 13.1 (foundation — everything depends on this)
2. 13.2 + 13.3 + 13.10 in parallel (rates + positions + claim rewards)
3. 13.8 (useBalance + BalanceHeader — needs 13.2 + 13.3 output shapes)
4. 13.4 (protocol-aware transactions — needs 13.3 position data with protocol labels)
5. 13.5 (rebalance tx type)
6. 13.6 + 13.7 + 13.11 in parallel (agent, Enoki, contextual chips)
7. 13.9 (wire smart card [Switch] action)
8. 13.12 (tests)

**Key design decisions (v1 simplicity):**
- **Save:** Always routes to `bestSaveRate.protocolId` (best rate protocol)
- **Withdraw all:** From the protocol where user has the most savings
- **Repay all:** On the protocol with the highest borrow APY (most expensive debt first)
- **Borrow:** From the protocol with the lowest borrow rate (if user has collateral there)
- **No multi-protocol PTBs for v1:** Each lending tx targets a single protocol. Rebalance is the exception (withdraw + swap + deposit in one PTB, but that's its own tx type)

**Risk mitigation:**
- Suilend cold-start latency: mitigated by singleton caching + lazy init
- Enoki allowlist: verify before deploying — blocked transactions are the #1 risk
- `@suilend/sdk` bundle: verify it resolves correctly in the web-app monorepo build
- Console noise: SDK's `quietSuilend()` suppresses Pyth logs
- Concurrent Suilend init: if two API routes cold-start simultaneously, `getSdkClient()` may run `SuilendClient.initialize()` twice. Not a bug (both return valid data) but wastes ~3s. Acceptable for v1; can add a Promise-based init lock later if needed.
- Response shape backward-compat: all API changes are additive (new fields). Existing consumers (`useBalance`, agent tools) read only the fields they know — no breaking changes.

| Priority | High — core product feature, misleading UX without it |
|----------|-------------------------------------------------------|
| Est. | 2.5 days |
| Status | ✅ **COMPLETE** — All 12 tasks done, 221 tests passing, 2 review bugs fixed |

---

### POL-14: Remove Sui Sentinel Integration

**Rationale:** Sui Sentinel does not have a maintained SDK and requires constant manual package ID updates. It's an isolated feature with no web-app integration — removing it reduces maintenance burden and attack surface.

**Footprint to remove:**

| Layer | Files | What to delete/modify |
|-------|-------|-----------------------|
| SDK | `packages/sdk/src/protocols/sentinel.ts` | Delete entirely |
| SDK | `packages/sdk/src/t2000.ts` | Remove `sentinelList()`, `sentinelInfo()`, `sentinelAttack()` methods + import |
| SDK | `packages/sdk/src/types.ts` | Remove `SentinelAgent`, `SentinelVerdict`, `SentinelAttackResult` types |
| SDK | `packages/sdk/src/constants.ts` | Remove `SENTINEL` constant block (PACKAGE, AGENT_REGISTRY, ENCLAVE, PROTOCOL_CONFIG, TEE_API, SENTINELS_API, etc.) |
| SDK | `packages/sdk/src/index.ts` | Remove sentinel re-exports |
| SDK | `packages/sdk/src/browser.ts` | Remove sentinel re-exports if present |
| SDK | `packages/sdk/src/adapters/compliance.test.ts` | Remove sentinel-related test cases |
| SDK | `packages/sdk/src/protocols/sentinel.test.ts` | Delete entirely |
| CLI | `packages/cli/src/commands/sentinel.ts` | Delete entirely |
| CLI | `packages/cli/src/program.ts` | Remove sentinel command registration |
| MCP | `packages/mcp/src/tools/write.ts` | Remove `t2000_sentinel_attack` tool |
| MCP | `packages/mcp/src/tools/read.ts` | Remove `t2000_sentinel_list`, `t2000_sentinel_info` tools |
| MCP | `packages/mcp/src/tools/read.test.ts` | Remove sentinel test cases |
| MCP | `packages/mcp/src/tools/write.test.ts` | Remove sentinel test cases |
| MCP | `packages/mcp/src/prompts.ts` | Remove sentinel prompt/examples |
| MCP | `packages/mcp/src/prompts.test.ts` | Remove sentinel test cases |
| MCP | `packages/mcp/src/integration.test.ts` | Remove sentinel integration test cases |
| Scripts | `scripts/test-sentinel.ts`, `scripts/cli/test-sentinel.sh` | Delete entirely |
| Docs | `README.md`, `ARCHITECTURE.md`, `PRODUCT_FACTS.md`, `CLI_UX_SPEC.md`, `packages/sdk/README.md`, `packages/cli/README.md`, `packages/mcp/README.md` | Remove sentinel references |
| Skills | `t2000-skills/skills/t2000-sentinel/SKILL.md` | Delete entirely |
| Safeguards | `packages/sdk/src/safeguards/enforcer.test.ts`, `types.ts` | Remove sentinel operation type |

**Steps:**
1. Delete standalone files: `protocols/sentinel.ts`, `sentinel.test.ts`, `commands/sentinel.ts`, `scripts/test-sentinel.ts`, `scripts/cli/test-sentinel.sh`, `t2000-skills/skills/t2000-sentinel/SKILL.md`
2. Remove sentinel imports, methods, types, and constants from shared files
3. Remove MCP tools and CLI command registration
4. Update docs and README files
5. Run full test suite: `npm run test && npm run lint && npm run typecheck`

| Est. | 45 min |
|------|--------|
| Depends on | POL-13 complete |
| Priority | Medium — maintenance hygiene |
| Status | ✅ Done |

---

### POL-15: Investment Earn/Unearn for Non-Stablecoin Assets (SUI, BTC, ETH, GOLD)

**Goal:** Wire the SDK's `investEarn()`, `investUnearn()`, and `investRebalance()` into the web-app, allowing users to earn yield on their investment holdings (SUI, BTC, ETH, GOLD) by depositing them into lending protocols.

**Why separate from POL-13:** POL-13's rebalance is stablecoin-only (move USDC between NAVI/Suilend for best savings rate). Investment earn is a different concept — it deposits non-stablecoin assets into lending protocols, tracks them as `earning` in the portfolio, and requires the `earningAssets` exclusion set that affects `withdraw`, `balance`, and `borrow` calculations.

**What the SDK already provides:**
- `T2000.investEarn({ asset: 'SUI' })` — deposits SUI into the best lending protocol, marks position as earning
- `T2000.investUnearn({ asset: 'SUI' })` — withdraws from lending, marks position as no longer earning
- `T2000.investRebalance()` — per-asset, moves earning positions to higher-yielding protocols
- `portfolio.getPositions().filter(p => p.earning)` — tracks which assets are locked in lending
- `withdraw` and `balance` already exclude `earningAssets` from savings totals

**What the web-app needs:**
1. **Portfolio tracking in the web-app** — currently CLI-only via local `portfolio.json`. Web-app needs server-side or on-chain position tracking to know which assets are earning.
2. **"Earn yield" toggle per investment asset** — UI in asset detail or BalanceHeader to enable/disable earning on each held asset
3. **Earn/unearn transaction types** in `/api/transactions/prepare` — route to the correct lending adapter
4. **Balance display changes** — show "(earning X%)" badge next to assets deposited in lending
5. **Auto-unearn before sell** — the SDK already handles this (`investSell` calls `investUnearn` first), but the web-app sell flow needs to be aware
6. **Agent awareness** — agent should suggest "Your SUI is sitting idle — earn 2.1% on it?" via smart card or contextual chip
7. **Borrow guard** — investment collateral (non-stablecoins) excluded from borrowable collateral. Agent and UI must explain this clearly.

**Risks:**
- Portfolio state sync between web-app and on-chain — if user earns via CLI then opens web-app, positions must reconcile
- `earningAssets` exclusion set affects `withdraw`, `balance`, and `borrow` — must be consistently applied in all API routes
- Suilend may not support all assets (e.g., GOLD) — adapter must handle gracefully

| Est. | 2-3 days |
|------|----------|
| Depends on | POL-13 complete |
| Priority | Medium — nice-to-have yield feature for investment holders |
| Status | ⏳ Placeholder — scope and tasks TBD |

---

## Risk Checklist

| Risk | Mitigation | When to check |
|------|-----------|---------------|
| SDK refactor breaks CLI/MCP | Run full test suite after Phase 1 | End of Week 1 |
| ZK proof generation slow (>5s) | Mysten's prover is typically <2s. Show loading screen. | Week 2 integration |
| Google OAuth redirect issues | Test on multiple browsers, incognito. Handle popup blockers. | Week 2 |
| Smart cards feel noisy | Start with max 3 cards visible. Add "Dismiss" on non-critical cards. | Week 3 user testing |
| LLM hallucination on financial queries | LLM NEVER executes directly. Always shows confirmation card. User confirms. | Week 4 |
| Services form generation doesn't cover all APIs | Start with top 5 services (gift cards, image gen, search). Add others incrementally. | Week 5 |
| Mobile keyboard covers input bar | Pin input to bottom with `position: sticky`. Test iOS Safari specifically. | Week 5 |
