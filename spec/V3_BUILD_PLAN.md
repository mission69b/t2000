# v3 Build Plan

> Concrete implementation plan for T2000_V3_SPEC.md. Maps spec sections to code changes, ordered by dependency.

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

### 3.7 — Vercel Deployment Config ⏳

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
| Sentinels | `t2000_sentinel_list` → browse → `t2000_sentinel_attack` | Grid + detail + attack |
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

### 6.7 — Beta Test ⏳

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
              Rates, Sentinels, Help
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

### Gap 7: `[Sentinels]` chip flow ⏳

Phase 6 — remaining chip flows.

### Gap 8: `[Rates]` chip ✅

`[Rates]` is in ChipBar under `[More...]`. Currently renders AI text response; will wire to `t2000_all_rates` in Phase 6.

### Gap 9: `[Help]` chip ✅

`[Help]` chip implemented. Renders formatted feature list via intent parser and feed.

### Gap 10: Vercel deployment config ⏳

Manual Vercel setup needed before beta deploy.

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
