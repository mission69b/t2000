# t2000 × OWS — Assessment & Future Integration Reference

**Version:** 2.0  
**Date:** February 2026  
**Status:** Assessment (not active)  
**Decision:** Do not adopt OWS now. Stay on Sui. Fix what's built. Revisit in 6 months.  

---

## 1. Decision Summary

OWS (Open Wallet Standard) launched March 23, 2026 — 10 days ago. It's backed by a strong coalition (MoonPay, Sui Foundation, Circle, PayPal, 17 others), but the code is brand new (22 versions in 10 days) and the "ecosystem" is an architecture diagram, not real integrations.

t2000 has already built working equivalents of everything OWS provides for its Sui use case:

| Capability | t2000 (today) | OWS |
|-----------|--------------|-----|
| Key encryption | AES-256-GCM + scrypt (`keyManager.ts`) | AES-256-GCM + scrypt (Rust core) |
| Key storage | `~/.t2000/wallet.key` | `~/.ows/wallets/` |
| Signing abstraction | `TransactionSigner` interface | `signTransaction()` |
| Agent access | PIN sessions + MCP tools | API keys + policy engine |
| Safeguards | `SafeguardEnforcer` | Policy engine |
| Gas sponsorship | Enoki (zero gas for new users) | **None** |
| Consumer auth | zkLogin (Google Sign-In → instant wallet) | **None** |
| Init wizard | `t2000 init` (wallet + MCP + safeguards) | `ows wallet create` (wallet only) |
| Payments | MPP gateway (`mpp.t2000.ai`, 90+ endpoints) | `ows pay request` (raw x402 only) |
| Multi-chain | Sui only | 9 chains |

The only thing OWS offers that t2000 doesn't have is multi-chain key derivation. That's a future need, not a current one.

**Adopting OWS now would mean:**
- Ripping out working key management for a 10-day-old standard
- Losing Enoki gas sponsorship (new OWS wallets have no gas)
- Losing the init wizard (which sets up MCP + safeguards in one flow)
- Adding a native binary dependency (`@napi-rs` Rust FFI)
- Taking a dependency on MoonPay's project direction
- Spending 6-8 days on migration instead of fixing bugs and shipping features

**The right strategy:** Stay on Sui. Double down on what's working. Watch OWS. Add it as an *optional* signer later if the standard proves itself.

---

## 2. What t2000 Should Do Now

### 2.1 Immediate Priorities (current product)

| Priority | Task | Why |
|----------|------|-----|
| P0 | Fix web app bugs (Beta blockers) | Users need reliability |
| P0 | Add CLI unit tests (currently 0) | Can't ship features on untested code |
| P1 | Polish web app conversational UX | The magic moment — "save $100" just works |
| P1 | On-chain transaction history | Replace fragile balance-diffing |
| P2 | Clean up `Ed25519Keypair` debt (see §5) | Good hygiene regardless of OWS |
| P2 | Polish CLI + MCP experience | Init wizard, help text, error messages |

### 2.2 What NOT To Do

- Don't adopt OWS until it's at least 6 months old with real ecosystem integrations
- Don't build multi-chain until Sui DeFi experience is rock solid
- Don't rip out the init wizard, PIN sessions, or key management
- Don't drop Enoki gas sponsorship
- Don't chase multi-chain for hypothetical users — current users are on Sui

### 2.3 Simplicity Principles

1. **Ship less, ship right.** One feature that works like magic beats five that kinda work.
2. **Fix before build.** Bugs and missing tests come before new infrastructure.
3. **Sui first.** Earn the right to go multi-chain by being the best on one chain.
4. **Watch, don't adopt.** Monitor OWS. Don't bet on a 10-day-old standard.
5. **Keep what works.** zkLogin, Enoki, MPP gateway, init wizard — these are advantages.

---

## 3. t2000's Existing Advantages (Don't Throw These Away)

### 3.1 Enoki Gas Sponsorship

New users sign in with Google, get a wallet, and can transact immediately with $0 balance. Enoki sponsors the gas. This is a genuine UX breakthrough that OWS cannot replicate — OWS wallets start empty on every chain.

### 3.2 zkLogin (Google OAuth → Instant Wallet)

One-click sign in. No seed phrase. No install. No browser extension. The user goes from zero to DeFi in 10 seconds. This is the web app's killer feature and it's Sui-specific — it doesn't need multi-chain.

### 3.3 MPP Gateway

`t2000 pay https://mpp.t2000.ai/openai/v1/chat/completions` works today. It's a real product with 90+ configured endpoints, payment routing, credential management, and a proxy gateway. OWS's `ows pay request` is a raw x402 primitive — it signs a payment and sends it. MPP is the intelligence layer on top.

### 3.4 Init Wizard

`t2000 init` creates a wallet, sets up MCP configuration, configures safeguards, and gets the user running in one flow. Replacing this with "install OWS separately, create a wallet, then connect it to t2000" is a worse experience.

### 3.5 `TransactionSigner` Abstraction

This is the key architectural insight: t2000 already has a clean signer interface.

```typescript
export interface TransactionSigner {
  getAddress(): string;
  signTransaction(txBytes: Uint8Array): Promise<{ signature: string }>;
}
```

Three implementations exist today:
- `KeypairSigner` — CLI (Ed25519 keypair from encrypted storage)
- `ZkLoginSigner` — Web app (ephemeral keypair + zk proof)
- Future: `OwsSigner` — would wrap OWS (when/if adopted)

Because everything goes through `TransactionSigner`, adding OWS support later is a ~50-line adapter. It doesn't require ripping anything out.

---

## 4. When to Reconsider OWS

Revisit this spec when ANY of these conditions are met:

| Trigger | Signal |
|---------|--------|
| OWS has real ecosystem integrations | At least 3 major tools/agents using OWS wallets in production |
| Multi-chain demand from users | Users are asking "can I use USDC from Base?" repeatedly |
| OWS is 6+ months old | Standard has stabilized, breaking changes are behind it |
| t2000 Sui product is solid | Web app bugs are fixed, CLI has tests, UX is polished |
| Competitor adopts OWS | Another DeFi banking product ships OWS integration and gains traction |

**If/when we adopt:** Add `OwsSigner` as an *optional* signer alongside `KeypairSigner` and `ZkLoginSigner`. Don't remove existing signers. Let users choose.

```typescript
// Future: OWS as an OPTION, not a replacement
const agent = T2000.fromOws('agent-treasury');       // OWS signer
const agent2 = await T2000.create({ pin: '1234' });  // Existing keypair signer
const agent3 = T2000.fromZkLogin({ ... });            // Existing zkLogin signer
```

---

## 5. Valuable Regardless of OWS: Clean Up Keypair Debt

This is worth doing now — it makes the codebase cleaner and prepares for *any* future signer (OWS or otherwise).

### 5.1 Code Gaps

Several files bypass the `TransactionSigner` interface and use `Ed25519Keypair` directly:

| # | Gap | File(s) | Issue | Fix |
|---|-----|---------|-------|-----|
| G1 | MPP uses `Ed25519Keypair` directly | `mpp-sui/src/client.ts` | `SuiChargeOptions.signer: Ed25519Keypair` | Accept `TransactionSigner` |
| G2 | `T2000.pay()` casts signer to keypair | `sdk/src/t2000.ts` | `this._keypair ?? (this._signer as unknown as Ed25519Keypair)` | Use `execute` callback |
| G3 | Cetus `executeSwap` bypasses signer | `sdk/src/protocols/cetus.ts` | `signAndExecuteTransaction({ signer: keypair })` | Delete `executeSwap`; use `buildSwapTx` + `executeWithGas` |
| G4 | NAVI protocol has direct keypair paths | `sdk/src/protocols/navi.ts` | Some functions accept `Ed25519Keypair` directly | Route through `executeWithGas` |
| G5 | Sentinel protocol has direct keypair paths | `sdk/src/protocols/sentinel.ts` | `signAndExecuteTransaction({ signer: keypair })` | Route through `executeWithGas` |
| G6 | `buildAndExecuteSend` uses keypair | `sdk/src/wallet/send.ts` | `signAndExecuteTransaction({ signer: keypair })` | Remove; use `buildSendTx` + `executeWithGas` |

**This is ~2 days of work and makes the codebase cleaner regardless of OWS.**

After this cleanup, adding *any* new signer type (OWS, hardware wallet, multi-sig, etc.) is just implementing the `TransactionSigner` interface — no other changes needed.

### 5.2 Test Coverage Gaps

| Area | Files | Tests | Status |
|------|-------|-------|--------|
| SDK core (`t2000.ts`) | 1 | 1346 lines | Good |
| SDK protocols (navi, cetus, sentinel) | 3 | 1038 lines | Good |
| SDK adapters (navi, suilend, cetus, registry) | 5 | 1179 lines | Good |
| SDK wallet (keyManager, signers, send) | 4 | 287 lines | Adequate |
| SDK gas management | 3 | 412 lines | Good |
| SDK safeguards | 1 | 243 lines | Good |
| MCP tools (read, write, safety) | 6 | 1024 lines | Good |
| MPP Sui (client, server, utils) | 3 | 303 lines | Adequate |
| Web app (smart-cards, intent-parser, APIs) | 6 | 634 lines | Adequate |
| **CLI commands** | **0** | **0 lines** | **No tests** |
| **Server (apps/server)** | **1** | **8 lines** | **No real tests** |
| **Gateway API routes** | **3** | **240 lines** | **Partial** |

The CLI having 0 tests is the biggest gap. Fix that before adding any new features or integrations.

---

## 6. OWS Technical Reference (for future use)

Preserving the technical analysis so we don't have to redo it.

### 6.1 OWS Architecture

```
Agent / CLI / App
       │
       │  OWS Interface (SDK / CLI / MCP / REST)
       ▼
┌─────────────────────┐
│    Access Layer      │     1. Caller invokes sign()
│  ┌────────────────┐  │     2. Policy engine evaluates for API tokens
│  │ Policy Engine   │  │     3. Key decrypted in hardened memory
│  │ (pre-signing)   │  │     4. Transaction signed
│  └───────┬────────┘  │     5. Key wiped from memory
│  ┌───────▼────────┐  │     6. Signature returned
│  │  Signing Core   │  │
│  │   (in-process)  │  │
│  └───────┬────────┘  │
│  ┌───────▼────────┐  │
│  │  Wallet Vault   │  │
│  │ ~/.ows/wallets/ │  │
│  └────────────────┘  │
└─────────────────────┘
```

### 6.2 OWS API (Node.js)

```typescript
import {
  createWallet,      // Create wallet with addresses for all chains
  getWallet,         // Get wallet details by name or ID
  listWallets,       // List all wallets
  deleteWallet,      // Delete a wallet
  exportWallet,      // Export mnemonic/keys
  signMessage,       // Sign a message (chain-specific formatting)
  signTransaction,   // Sign a raw transaction
  signAndSend,       // Sign and broadcast a transaction
  createApiKey,      // Create API key for agent access
  listApiKeys,       // List all API keys
  revokeApiKey,      // Revoke an API key
  createPolicy,      // Register a policy
  listPolicies,      // List all policies
} from '@open-wallet-standard/core';
```

### 6.3 OWS CLI Commands

| Command | Description |
|---------|-------------|
| `ows wallet create --name <name>` | Create wallet with addresses for all chains |
| `ows wallet list` | List all wallets |
| `ows wallet info` | Show vault path and supported chains |
| `ows sign message --wallet <name> --chain <chain> --message <msg>` | Sign a message |
| `ows sign tx --wallet <name> --chain <chain> --tx <hex>` | Sign a transaction |
| `ows pay request` | Make a paid request to x402-enabled API |
| `ows fund deposit` | MoonPay fiat on-ramp to fund wallet with USDC |
| `ows fund balance` | Check token balances |
| `ows key create` | Create API key for agent access |
| `ows key revoke` | Revoke an API key |
| `ows policy create` | Register a policy from JSON |

### 6.4 Supported Chains

| Chain | Curve | Derivation Path |
|-------|-------|----------------|
| EVM | secp256k1 | `m/44'/60'/0'/0/0` |
| Solana | Ed25519 | `m/44'/501'/0'/0'` |
| Sui | Ed25519 | `m/44'/784'/0'/0'/0'` |
| Bitcoin | secp256k1 | `m/84'/0'/0'/0/0` |
| Cosmos | secp256k1 | `m/44'/118'/0'/0/0` |
| Tron | secp256k1 | `m/44'/195'/0'/0/0` |
| TON | Ed25519 | `m/44'/607'/0'` |
| Filecoin | secp256k1 | `m/44'/461'/0'/0/0` |

### 6.5 Technical Callouts

| Item | Detail |
|------|--------|
| **Native binary** | `@napi-rs` Rust FFI. Platform-specific: linux-x64, linux-arm64, darwin-x64, darwin-arm64. No Windows. |
| **Versioning** | v1.0.0 published Mar 23, 2026. 22 versions in 10 days. Very early. |
| **Sui signing** | Ed25519 on `m/44'/784'/0'/0'/0'`. Matches Sui standard. Must verify intent-prefix format. |
| **`ows fund deposit`** | MoonPay fiat on-ramp built-in. Handles wallet funding. |
| **`ows pay request`** | Raw x402 payment primitive. Overlaps with MPP at wallet level only. |
| **Passphrase** | Vault encrypted with user passphrase. API keys bypass passphrase for agents. |
| **Package** | npm: `@open-wallet-standard/core`. pip: `open-wallet-standard`. crate: `ows-cli`. |
| **License** | MIT (CC0 for spec). Can fork if needed. |
| **Coalition** | 21 founding orgs. Sui Foundation is a member. |

### 6.6 `OwsSigner` Adapter (ready to use when needed)

```typescript
// packages/sdk/src/wallet/owsSigner.ts — FUTURE, not now
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

This is ~30 lines. When the time comes, adding OWS support is trivial because `TransactionSigner` already abstracts signing.

---

## 7. Future Multi-Chain Vision (Reference Only)

Not actionable now. Preserved for when the product is ready and users are asking for it.

### 7.1 Cross-Chain Smart Routing

The killer feature — when/if multi-chain is built:

```bash
t2000 save 1000
# Check USDC balance across chains
# Query rates from all adapters
# Calculate: is bridging worth it?
# Execute on best chain — or skip the bridge
```

### 7.2 Cross-Chain Rebalance

```bash
t2000 rebalance
# Move funds from lower-yield chain to higher-yield chain
# Only when rate difference justifies bridge cost
```

### 7.3 MPP vs `ows pay`

These are complementary, not competitive:

```
ows pay request  →  "Sign this x402 payment"          (wallet-level primitive)
t2000 pay        →  "Pay for OpenAI, cheapest route"   (application-level intelligence)
```

MPP gateway (`mpp.t2000.ai`) provides service registry, payment routing, credential management, and access control. `ows pay` is just raw signing. MPP would use OWS signing under the hood if adopted.

### 7.4 OWS Ecosystem Distribution

When/if OWS ecosystem matures, t2000 MCP tools could be listed alongside OWS wallet tools. Any OWS wallet user would get t2000 banking. This is a distribution channel, not a product requirement.

### 7.5 Circle CCTP for Bridging

Circle CCTP provides native USDC bridging (~2 min, ~$0.10) between Sui, Base, Ethereum, Solana. This is the cleanest bridge path for multi-chain — no wrapped tokens, no slippage.

---

## 8. Summary

| Question | Answer |
|----------|--------|
| Should we adopt OWS now? | **No.** It's 10 days old. We've already built what we need. |
| Should we drop Enoki gas sponsorship? | **No.** It's a competitive advantage. New users transact with $0. |
| Should we go cross-chain? | **Not yet.** Sui users don't need it. Fix bugs first. |
| Is the web app still needed? | **Yes.** zkLogin + Enoki is beautiful UX. Keep building it. |
| Is the init wizard still needed? | **Yes.** It's a better onboarding flow than "install OWS separately." |
| Does MPP gateway still work? | **Yes.** `t2000 pay` → `mpp.t2000.ai` is unchanged. OWS has no impact on this. |
| What about the `TransactionSigner` interface? | **It's the insurance policy.** If/when we adopt OWS, `OwsSigner` is a ~30 line adapter. |
| When should we revisit? | When OWS is 6+ months old, has real ecosystem traction, AND our Sui product is solid. |
| What should we do now? | Fix bugs. Add tests. Polish UX. Ship reliable features. |

### What Simplicity Means Here

- **The product is Sui-first DeFi banking.** zkLogin web app + CLI + MCP tools.
- **Fix what's broken.** Web app bugs, CLI tests, fragile balance detection.
- **Ship what users need.** On-chain history, better error messages, smoother flows.
- **Don't chase shiny things.** OWS is interesting research, not an action item.
- **The `TransactionSigner` abstraction is the strategy.** It makes OWS (or anything else) a future option without any current cost.

**One chain. One product. Make it work like magic. Then expand.**
