# t2000 × OWS — Product Positioning & Integration Spec

**Version:** 1.0  
**Date:** February 2026  
**Status:** Draft  

---

## 1. Executive Summary

The Open Wallet Standard (OWS) — backed by MoonPay, Sui Foundation, Circle, PayPal, and 17 other organizations — solves the "where do keys live" problem for AI agents. t2000 solves the "what do agents do with those keys" problem: DeFi banking, multi-protocol payments, and autonomous financial operations.

These are complementary, not competitive. t2000 should adopt OWS as its key management and signing layer while keeping its entire DeFi intelligence, banking abstraction, and payment protocol stack.

**The analogy:** OWS is the card network. t2000 is the bank.

---

## 2. Stack Positioning

```
┌──────────────────────────────────────────────────────────┐
│  t2000 Web App / CLI / MCP Tools                        │  UX Layer
│  (conversational banking, chip flows, AI agent tools)    │
├──────────────────────────────────────────────────────────┤
│  t2000 SDK — Banking Abstraction                        │  Application Layer
│  save() borrow() send() invest() pay() exchange()       │  ← YOUR MOAT
├──────────────────────────────────────────────────────────┤
│  DeFi Adapter Framework                                  │  Protocol Layer
│  NAVI · Suilend · Cetus · (future: Aave, Compound)      │  ← YOUR MOAT
├──────────────────────────────────────────────────────────┤
│  MPP — Machine Payment Protocol                         │  Payment Layer
│  (agent-to-service payments, 90+ endpoints)              │  ← YOUR MOAT
├──────────────────────────────────────────────────────────┤
│  OWS — Open Wallet Standard                             │  Key Layer
│  (encrypted vault, policy engine, multi-chain signing)   │  ← ADOPT THIS
├──────────────────────────────────────────────────────────┤
│  Blockchains                                            │  Settlement Layer
│  Sui · Base · Ethereum · Solana · Bitcoin · Cosmos       │
└──────────────────────────────────────────────────────────┘
```

### What OWS handles (adopt, stop maintaining)

| Concern | Current t2000 | OWS |
|---------|--------------|-----|
| Key generation | `Ed25519Keypair` via `@mysten/sui` | `createWallet()` — BIP-39 mnemonic, all chains |
| Key encryption | Custom AES-256-GCM + scrypt in `keyManager.ts` | AES-256-GCM + scrypt in Rust core, mlocked memory |
| Key storage | `~/.t2000/wallet.key` (JSON) | `~/.ows/wallets/` (encrypted vault) |
| Signing | `KeypairSigner.signTransaction()` | `signTransaction(wallet, "sui", txHex)` |
| PIN/passphrase | `~/.t2000/.session` (plaintext PIN) | Passphrase-based decryption, API keys for agents |
| Multi-chain | Sui only | 9 chains: EVM, Solana, Sui, Bitcoin, Cosmos, Tron, TON, Spark, Filecoin |
| Agent access control | None (full key access) | API keys with wallet scope + policy engine |

### What t2000 keeps (moat, not touched by OWS)

| Concern | Description |
|---------|-------------|
| Banking abstraction | `save()`, `borrow()`, `send()`, `withdraw()`, `repay()`, `invest()`, `exchange()` |
| DeFi adapters | NAVI Protocol, Suilend, Cetus — yield, lending, swaps |
| MPP gateway | Machine Payment Protocol for agent-to-service payments |
| MCP tools | Model Context Protocol tools for AI agent integration |
| Smart cards | Intelligent financial recommendations from on-chain data |
| Web app | zkLogin consumer UX (not an OWS use case) |
| Transaction building | All Sui Move call construction, Pyth oracle updates, gas optimization |
| Safeguards | Amount limits, dry-run simulation, health factor monitoring |
| Rate intelligence | Best rate comparison across protocols |

---

## 3. Current Architecture — What Changes

### 3.1 Files to Replace

| File | Current Role | Migration |
|------|-------------|-----------|
| `packages/sdk/src/wallet/keyManager.ts` | AES-256-GCM encrypted key storage | **Delete.** OWS handles storage. |
| `packages/sdk/src/wallet/keypairSigner.ts` | Ed25519 → TransactionSigner wrapper | **Replace** with `OwsSigner` adapter. |
| `packages/cli/src/prompts.ts` | PIN session in `~/.t2000/.session` | **Replace** with OWS passphrase / API key flow. |
| `packages/cli/src/commands/init.ts` | Wallet creation + PIN setup | **Replace** with `ows wallet create` + import into t2000 config. |
| `packages/cli/src/commands/importKey.ts` | Private key import | **Replace** with `ows wallet import` or `importWalletPrivateKey`. |
| `packages/cli/src/commands/exportKey.ts` | Private key export | **Replace** with `ows wallet export`. |
| `packages/cli/src/commands/lock.ts` | Session lock/clear | **Remove.** OWS manages its own access lifecycle. |
| `packages/mcp/src/unlock.ts` | MCP agent PIN resolution | **Replace** with OWS API key auth. |

### 3.2 Files to Keep (unchanged)

| File | Role | Why It Stays |
|------|------|-------------|
| `packages/sdk/src/signer.ts` | `TransactionSigner` interface | Interface stays — OWS adapter implements it. |
| `packages/sdk/src/wallet/zkLoginSigner.ts` | zkLogin signing for web | Web app keeps zkLogin (browser-based, different audience). |
| `packages/sdk/src/t2000.ts` | Agent lifecycle, banking methods | Core product logic. Signer source changes, not the API. |
| `packages/sdk/src/adapters/*` | DeFi protocol adapters | Untouched by key layer change. |
| `packages/sdk/src/protocols/*` | Raw protocol interactions | Untouched. |
| `packages/sdk/src/gas/*` | Gas management, sponsored tx | Untouched — uses `TransactionSigner` already. |
| `packages/mpp-sui/*` | MPP payment client | Needs refactor to use `TransactionSigner` (see §3.4). |
| `apps/web-app/*` | Consumer web app | Keeps zkLogin + Enoki. Not an OWS use case. |

### 3.3 The `TransactionSigner` Bridge

t2000's existing `TransactionSigner` interface is the clean boundary:

```typescript
// packages/sdk/src/signer.ts — KEEP AS-IS
export interface TransactionSigner {
  getAddress(): string;
  signTransaction(txBytes: Uint8Array): Promise<{ signature: string }>;
}
```

New OWS adapter:

```typescript
// packages/sdk/src/wallet/owsSigner.ts — NEW
import { signTransaction, getWallet } from '@open-wallet-standard/core';
import type { TransactionSigner } from '../signer.js';

export class OwsSigner implements TransactionSigner {
  private readonly walletName: string;
  private readonly suiAddress: string;

  constructor(walletName: string) {
    this.walletName = walletName;
    const wallet = getWallet(walletName);
    const suiAccount = wallet.accounts.find(a => a.chainId.startsWith('sui:'));
    if (!suiAccount) throw new Error(`No Sui account in wallet "${walletName}"`);
    this.suiAddress = suiAccount.address;
  }

  getAddress(): string {
    return this.suiAddress;
  }

  async signTransaction(txBytes: Uint8Array): Promise<{ signature: string }> {
    const txHex = Buffer.from(txBytes).toString('hex');
    const result = signTransaction(this.walletName, 'sui', txHex);
    return { signature: result.signature };
  }
}
```

Everything downstream (`executeWithGas`, `T2000.save()`, `T2000.send()`, etc.) continues to work with zero changes because it all goes through `TransactionSigner`.

### 3.4 MPP Client Fix

The current MPP client has a known fragile cast:

```typescript
// Current: packages/mpp-sui/src/client.ts
// this._keypair ?? (this._signer as unknown as Ed25519Keypair)
```

This should be refactored to accept `TransactionSigner` instead of `Ed25519Keypair`, which aligns with the OWS migration and fixes the zkLogin incompatibility.

### 3.5 `T2000` Construction — Before vs After

**Before (current):**
```typescript
// CLI: load encrypted key from ~/.t2000/wallet.key
const agent = await T2000.create({ pin: '1234' });

// Or from private key
const agent = T2000.fromPrivateKey('0xdeadbeef...');

// Or zkLogin (web)
const agent = T2000.fromZkLogin({ ephemeralKeypair, zkProof, userAddress, maxEpoch });
```

**After (with OWS):**
```typescript
// CLI/Agent: load from OWS vault
const agent = T2000.fromOws('agent-treasury');
// Internally: new OwsSigner('agent-treasury') → TransactionSigner

// Or with API key (for delegated agent access)
const agent = T2000.fromOws('agent-treasury', { apiKey: 'ows_key_...' });

// zkLogin (web) — unchanged
const agent = T2000.fromZkLogin({ ephemeralKeypair, zkProof, userAddress, maxEpoch });

// Direct signer (escape hatch)
const agent = T2000.fromSigner(anyTransactionSigner);
```

---

## 4. CLI Migration

### 4.1 Current Commands → OWS-backed

| Current | After Migration | Notes |
|---------|----------------|-------|
| `t2000 init` | `ows wallet create --name t2000-agent` + `t2000 connect t2000-agent` | OWS creates wallet. t2000 stores wallet name reference. |
| `t2000 import` | `ows wallet import-key --name t2000-agent --chain sui --key 0x...` + `t2000 connect t2000-agent` | OWS imports key. t2000 connects. |
| `t2000 export` | `ows wallet export t2000-agent` | Delegates entirely to OWS. |
| `t2000 lock` | `ows key revoke <key-id>` or remove API key | OWS manages access lifecycle. |
| `t2000 unlock` | No change needed — passphrase on first use | OWS handles decryption. |
| `t2000 balance` | Unchanged | Uses `TransactionSigner.getAddress()`. |
| `t2000 save/send/borrow/...` | Unchanged | Uses `TransactionSigner` — OWS provides it. |

### 4.2 New CLI Commands

```
t2000 connect <wallet-name>    Connect to an OWS wallet
t2000 disconnect               Disconnect current wallet
t2000 wallet                   Show connected wallet info (delegates to ows wallet info)
```

### 4.3 Config File

Instead of `~/.t2000/wallet.key` + `~/.t2000/.session`, t2000 stores only a reference:

```json
// ~/.t2000/config.json
{
  "wallet": "agent-treasury",
  "network": "mainnet",
  "rpcUrl": null
}
```

No keys. No PINs. Just a wallet name pointing to the OWS vault.

---

## 5. MCP Agent Integration

### 5.1 Current Pain

The MCP server (`packages/mcp/src/unlock.ts`) currently reads `T2000_PIN` from env or `~/.t2000/.session` to unlock the wallet. This is fragile and insecure (plaintext PIN in a file).

### 5.2 OWS Solution: API Keys

OWS API keys are designed for exactly this: delegated agent access with policy controls.

```bash
# Human creates an API key for the MCP agent
ows key create --name "mcp-agent" \
  --wallets "agent-treasury" \
  --policies "spending-limit" \
  --passphrase "hunter2"
# => ows_key_a1b2c3d4... (save this)

# MCP agent uses the API key — never sees the private key
export OWS_API_KEY=ows_key_a1b2c3d4...
```

```typescript
// packages/mcp/src/unlock.ts — simplified
import { OwsSigner } from '@t2000/sdk';

export function createAgent(): T2000 {
  const walletName = process.env.T2000_WALLET ?? 'agent-treasury';
  return T2000.fromOws(walletName, {
    apiKey: process.env.OWS_API_KEY,
  });
}
```

### 5.3 Policy Engine — Built-in Safeguards

OWS policies replace t2000's custom `SafeguardEnforcer` for key-level controls:

```json
{
  "id": "t2000-spending-limit",
  "name": "Daily spending limit",
  "version": 1,
  "rules": [
    { "type": "allowed_chains", "chain_ids": ["sui:mainnet"] },
    { "type": "expires_at", "timestamp": "2026-06-01T00:00:00Z" }
  ],
  "action": "deny"
}
```

t2000's application-level safeguards (amount limits, dry-run simulation, health factor checks) stay in the SDK — they operate at a higher level than key access.

---

## 6. Multi-Chain Expansion

OWS unlocks multi-chain for t2000 without building any key infrastructure.

### 6.1 Phase 1: Sui (current, no change)

Everything works today. OWS just replaces the key layer underneath.

### 6.2 Phase 2: EVM — Base/Ethereum

With OWS providing EVM keys and signing, t2000 can add:

| Adapter | Protocol | Chain | Capabilities |
|---------|----------|-------|-------------|
| `AaveAdapter` | Aave v3 | Base, Ethereum | save, borrow, withdraw, repay |
| `CompoundAdapter` | Compound v3 | Base, Ethereum | save, borrow, withdraw, repay |
| `UniswapAdapter` | Uniswap v3 | Base, Ethereum | exchange |

The `LendingAdapter` interface (`packages/sdk/src/adapters/types.ts`) is already chain-agnostic:

```typescript
export interface LendingAdapter {
  readonly id: string;
  readonly name: string;
  readonly chain: string;  // NEW: 'sui' | 'evm' | 'solana'
  readonly supportedAssets: readonly string[];
  
  getRates(asset: string): Promise<LendingRates>;
  getPositions(address: string): Promise<AdapterPositions>;
  buildSaveTx(address: string, amount: number, asset: string): Promise<AdapterTxResult>;
  // ... etc
}
```

The `AdapterRegistry` already supports multiple adapters. Multi-chain means the registry finds the best rate across chains:

```typescript
// "Where should I save $1000 USDC?"
const best = await registry.bestSaveRate('USDC');
// => { adapter: AaveAdapter, rate: { saveApy: 8.2 }, chain: 'base' }
// vs { adapter: NaviAdapter, rate: { saveApy: 6.1 }, chain: 'sui' }
```

### 6.3 Phase 3: Solana

| Adapter | Protocol | Chain | Capabilities |
|---------|----------|-------|-------------|
| `MarinadeAdapter` | Marinade Finance | Solana | save (liquid staking) |
| `DriftAdapter` | Drift Protocol | Solana | borrow, exchange |

### 6.4 MPP Multi-Chain

MPP currently uses `mpp-sui` for Sui-specific payments. With OWS:

```
mpp-sui   → MPP payments on Sui (existing)
mpp-evm   → MPP payments on Base/Ethereum (new, uses x402)
mpp-sol   → MPP payments on Solana (new)
```

The MPP gateway (`apps/gateway`) can route payments to the cheapest chain.

---

## 7. Web App — No Change

The web app (`apps/web-app`) continues using **zkLogin + Enoki** for browser-based consumer UX. This is the right choice because:

1. **No seed phrase** — Google Sign-In is the auth. Consumers don't want mnemonics.
2. **Sponsored transactions** — Enoki covers gas. New users start with $0 and can still transact.
3. **Browser environment** — OWS is local-first (filesystem vault). Browsers don't have filesystem access.
4. **Different audience** — Web app is consumer banking. OWS is developer/agent infrastructure.

If a future browser extension is built, it could use OWS for key management while still using the t2000 SDK for banking operations.

---

## 8. Migration Plan

### Phase M0: Preparation (1-2 days)

- [ ] Refactor `mpp-sui` client to accept `TransactionSigner` instead of `Ed25519Keypair`
- [ ] Audit remaining direct `keypair` usage in protocol helpers — route through `TransactionSigner`
- [ ] Add `chain` field to `LendingAdapter` interface for future multi-chain

### Phase M1: OWS Adapter (2-3 days)

- [ ] Install `@open-wallet-standard/core` in `packages/sdk`
- [ ] Create `OwsSigner` implementing `TransactionSigner` (see §3.3)
- [ ] Add `T2000.fromOws(walletName, options?)` static constructor
- [ ] Add `T2000.fromSigner(signer)` escape hatch constructor
- [ ] Write tests for `OwsSigner` (mock OWS calls)

### Phase M2: CLI Migration (2-3 days)

- [ ] Replace `t2000 init` with `t2000 connect` (references OWS wallet)
- [ ] Add `t2000 connect <wallet-name>` and `t2000 disconnect`
- [ ] Write `~/.t2000/config.json` instead of `wallet.key` + `.session`
- [ ] Remove `importKey.ts`, `exportKey.ts`, `lock.ts` — delegate to `ows` CLI
- [ ] Update `resolvePin()` → `resolveWallet()` in all commands
- [ ] Update CLI help text and docs

### Phase M3: MCP Integration (1 day)

- [ ] Update `packages/mcp/src/unlock.ts` to use `T2000.fromOws()` with API key
- [ ] Remove PIN-based session management from MCP
- [ ] Document OWS API key setup for MCP agents

### Phase M4: Cleanup & Docs (1 day)

- [ ] Delete `keyManager.ts`, `keypairSigner.ts`, `prompts.ts` (PIN session)
- [ ] Update `README.md`, CLI help, SDK docs
- [ ] Update `CLAUDE.md` with OWS conventions
- [ ] Publish SDK version bump

### Phase M5: Multi-Chain Foundation (future, after M0-M4)

- [ ] Add `chain` field to adapter types
- [ ] Create `EvmSigner` using OWS for EVM signing
- [ ] Prototype `AaveAdapter` for Base
- [ ] Extend MPP for x402-based EVM payments

**Total M0-M4 estimate: 7-10 days**

---

## 9. SDK Public API — Before vs After

### Before

```typescript
import { T2000, generateKeypair, saveKey, loadKey, walletExists, exportPrivateKey } from '@t2000/sdk';

// Key management (DELETE)
const kp = generateKeypair();
await saveKey(kp, '1234');
const loaded = await loadKey('1234');

// Agent creation
const agent = await T2000.create({ pin: '1234' });
const agent2 = T2000.fromPrivateKey('0x...');
const agent3 = T2000.fromZkLogin({ ... });

// Banking (KEEP)
await agent.save({ amount: 100 });
await agent.send({ to: '0x...', amount: 50 });
```

### After

```typescript
import { T2000 } from '@t2000/sdk';

// Agent creation — OWS-backed
const agent = T2000.fromOws('agent-treasury');
const agent2 = T2000.fromOws('agent-treasury', { apiKey: 'ows_key_...' });

// Agent creation — zkLogin (web, unchanged)
const agent3 = T2000.fromZkLogin({ ... });

// Agent creation — escape hatch
const agent4 = T2000.fromSigner(myCustomSigner);

// Banking (IDENTICAL — the moat)
await agent.save({ amount: 100 });
await agent.send({ to: '0x...', amount: 50 });
await agent.borrow({ amount: 200 });
await agent.repay({ amount: 50 });
await agent.invest({ asset: 'SUI', amount: 100 });
await agent.pay({ service: 'openai', amount: 0.01 });
```

Key management exports (`generateKeypair`, `saveKey`, `loadKey`, etc.) are removed from the SDK public API. Wallet operations go through `ows` CLI.

---

## 10. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| OWS standard changes / breaks | Low | Medium | Pin to specific version. `TransactionSigner` abstraction isolates us. |
| OWS native binary compatibility issues | Medium | Low | Fallback `KeypairSigner` path remains available via `fromSigner()`. |
| OWS Sui signing produces wrong format | Low | High | Test against Sui RPC before migration. Ed25519 signing is straightforward. |
| Coalition loses momentum | Low | Low | Standard is MIT-licensed, self-contained. We can fork if needed. |
| Users resist `ows` CLI dependency | Medium | Medium | `fromSigner()` escape hatch. Can also embed OWS as a library dependency. |
| Multi-chain DeFi adapter complexity | High | Medium | Phase incrementally. Start with Sui-only OWS, add chains one at a time. |

---

## 11. Competitive Positioning

### Before OWS

> "t2000 is a bank account for AI agents on Sui."

Narrow. Sui-specific. Competing on the full stack from keys to banking.

### After OWS

> "t2000 is the DeFi banking layer for AI agents. Any chain. Any wallet."

Broader. Chain-agnostic. Competing on intelligence, not plumbing.

### Messaging

- **For agent developers:** "Create an OWS wallet. Connect t2000. Your agent has a bank account with savings, credit, and payments — across every chain."
- **For the OWS ecosystem:** "OWS gives agents a wallet. t2000 gives that wallet a purpose: earn yield, borrow, pay for services, manage a treasury."
- **For MPP users:** "MPP now works with any OWS wallet. Sign a payment on Base, Sui, or Solana — same interface."

---

## 12. Summary

| Question | Answer |
|----------|--------|
| Is this a pivot? | No. It's an integration. |
| What do we stop building? | Key storage, encryption, PIN sessions. |
| What do we keep building? | DeFi adapters, banking abstraction, MPP, MCP tools, web app. |
| What do we gain? | Multi-chain, industry standard, security hardening, interoperability, credibility. |
| What's the risk? | Low. `TransactionSigner` abstraction means OWS is swappable. |
| Timeline? | 7-10 days for core migration (M0-M4). Multi-chain is additive after. |
| Does the web app change? | No. zkLogin stays for browser-based consumer UX. |

**One vault. One interface. Every chain. That's OWS.**  
**One SDK. Five accounts. Autonomous finance. That's t2000.**
