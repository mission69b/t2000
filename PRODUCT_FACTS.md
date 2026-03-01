# PRODUCT_FACTS.md — Single Source of Truth

> **Every README, docs page, skill file, and marketing material MUST match this file.**
> When a product fact changes, update this file FIRST, then propagate.
>
> Source: derived from actual source code in `packages/*/src/`.
> Last verified: 2026-02-27

---

## Version

| Package | Version |
|---------|---------|
| `@t2000/sdk` | `0.2.6` |
| `@t2000/cli` | `0.2.6` |
| `@t2000/x402` | `0.2.6` |
| Agent Skills | `1.2` |

---

## Agent Skills

| Fact | Value |
|------|-------|
| Install command | `npx skills add mission69b/t2000-skills` |
| Repo | `https://github.com/mission69b/t2000-skills` |
| Skill count | 9 |
| Skills | `t2000-check-balance`, `t2000-send`, `t2000-save`, `t2000-withdraw`, `t2000-swap`, `t2000-borrow`, `t2000-repay`, `t2000-pay`, `t2000-sentinel` |
| Supported platforms | Claude Code, Cursor, Codex, Copilot, Amp, Cline, Gemini CLI, VS Code, + more |
| Source (monorepo) | `t2000-skills/` — auto-synced to standalone repo via GitHub Action |

---

## Fees

| Operation | BPS | Rate | Notes |
|-----------|-----|------|-------|
| Save | 10 | 0.1% | Protocol fee on deposit |
| Borrow | 5 | 0.05% | Protocol fee on loan |
| Swap | 0 | **Free** | Only standard Cetus pool fees apply |
| Withdraw | — | Free | |
| Repay | — | Free | |
| Send | — | Free | |
| Pay (x402) | — | Free | Agent pays the API price, no t2000 surcharge |

Source: `packages/sdk/src/constants.ts` → `SAVE_FEE_BPS`, `SWAP_FEE_BPS`, `BORROW_FEE_BPS`

---

## Supported Assets

| Symbol | Decimals | Send | Save | Borrow | Swap |
|--------|----------|------|------|--------|------|
| USDC | 6 | ✅ | ✅ | ✅ | ✅ |
| SUI | 9 | ✅ (gas) | — | — | ✅ |

Source: `packages/sdk/src/constants.ts` → `SUPPORTED_ASSETS`

---

## CLI Commands

### Syntax (exact signatures from Commander.js)

| Command | Syntax | Notes |
|---------|--------|-------|
| init | `t2000 init` | Options: `--name <name>`, `--no-sponsor` |
| balance | `t2000 balance` | Options: `--show-limits` |
| send | `t2000 send <amount> <asset> [to] <address>` | `to` keyword is optional |
| save | `t2000 save <amount> [asset]` | `asset` defaults to USDC. Alias: `supply` |
| withdraw | `t2000 withdraw <amount> [asset]` | `asset` defaults to USDC. `amount` accepts `all` |
| borrow | `t2000 borrow <amount> [asset]` | `asset` defaults to USDC |
| repay | `t2000 repay <amount> [asset]` | `asset` defaults to USDC. `amount` accepts `all` |
| swap | `t2000 swap <amount> <from> <to>` | NO `to` keyword. Options: `--slippage <percent>` (default: 3) |
| pay | `t2000 pay <url>` | Options: `--method`, `--data`, `--header`, `--max-price`, `--timeout`, `--dry-run` |
| history | `t2000 history` | Options: `--limit <n>` (default: 20) |
| earnings | `t2000 earnings` | |
| fund-status | `t2000 fund-status` | |
| health | `t2000 health` | |
| rates | `t2000 rates` | |
| positions | `t2000 positions` | |
| deposit | `t2000 deposit` | Shows funding instructions |
| address | `t2000 address` | |
| serve | `t2000 serve` | Options: `--port` (default: 3001), `--rate-limit` (default: 10) |
| config get | `t2000 config get [key]` | Omit key for all |
| config set | `t2000 config set <key> <value>` | |
| export | `t2000 export` | Options: `--yes` to skip confirmation |
| import | `t2000 import` | |
| lock | `t2000 lock` | Clear saved session |
| sentinel list | `t2000 sentinel list` | List active sentinels with prize pools |
| sentinel info | `t2000 sentinel info <id>` | Show details for a sentinel |
| sentinel attack | `t2000 sentinel attack <id> [prompt]` | Attack a sentinel (full 3-step flow). Options: `--fee <sui>` |
| earn | `t2000 earn` | Show all earning opportunities — savings yield + sentinel bounties |

### Global Flags

| Flag | Description |
|------|-------------|
| `--json` | Machine-readable JSON output |
| `--yes` / `-y` | Skip confirmation prompts |
| `--key <path>` | Key file path (default: `~/.t2000/wallet.key`) |

### CLI Output Formats (canonical examples)

**balance:**
```
  Available:  $4.00 USDC  (checking — spendable)
  Savings:    $1.00 USDC  (earning 3.31% APY)
  Gas:        1.04 SUI    (~$0.98)
  ──────────────────────────────────────
  Total:      $5.98 USDC
```

**save:**
```
  ✓ Saved $1.00 USDC to NAVI
  ✓ Protocol fee: $0.00 USDC (0.1%)
  ✓ Current APY: 3.31%
  ✓ Savings balance: $1.00 USDC
  Tx:  https://suiscan.xyz/mainnet/tx/<digest>
```

**borrow:**
```
  ✓ Borrowed $0.20 USDC
  Health Factor:  4.24
  Tx:  https://suiscan.xyz/mainnet/tx/<digest>
```

**repay:**
```
  ✓ Repaid $0.20 USDC
  Remaining Debt:  $0.00
  Tx:  https://suiscan.xyz/mainnet/tx/<digest>
```

**swap:**
```
  ✓ Swapped 5 USDC → 5.8300 SUI
  Tx:  https://suiscan.xyz/mainnet/tx/<digest>
```

**send:**
```
  ✓ Sent $10.00 USDC → 0x8b3e...d412
  Gas:  0.0042 SUI (self-funded)
  Balance:  $90.00 USDC
  Tx:  https://suiscan.xyz/mainnet/tx/<digest>
```

**pay:**
```
  → GET https://api.example.com/data
  ← 402 Payment Required: $0.01 USDC (Sui)
  ✓ Paid $0.01 USDC (tx: 0xabc123ab...)
  ← 200 OK  [820ms]
```

---

## SDK Methods

### Construction

| Method | Signature | Description |
|--------|-----------|-------------|
| `T2000.create()` | `(options?: T2000Options): Promise<T2000>` | Load existing wallet. Key options: `pin`, `keyPath`, `rpcUrl` |
| `T2000.init()` | `(options: { pin: string; keyPath?: string; name?: string; sponsored?: boolean }): Promise<{ agent: T2000; address: string; sponsored: boolean }>` | Create new wallet |
| `T2000.fromPrivateKey()` | `(privateKey: string, options?: { rpcUrl?: string }): T2000` | From raw key |

### Wallet

| Method | Params | Returns |
|--------|--------|---------|
| `balance()` | — | `BalanceResponse` |
| `send()` | `{ to, amount, asset? }` | `SendResult` |
| `history()` | `{ limit? }` | `TransactionRecord[]` |
| `address()` | — (sync) | `string` |
| `deposit()` | — | `DepositInfo` |

### Savings

| Method | Params | Returns |
|--------|--------|---------|
| `save()` | `{ amount: number \| 'all', asset? }` | `SaveResult` |
| `withdraw()` | `{ amount: number \| 'all', asset? }` | `WithdrawResult` |
| `maxWithdraw()` | — | `MaxWithdrawResult` |

### Credit

| Method | Params | Returns |
|--------|--------|---------|
| `borrow()` | `{ amount, asset? }` | `BorrowResult` |
| `repay()` | `{ amount: number \| 'all', asset? }` | `RepayResult` |
| `maxBorrow()` | — | `MaxBorrowResult` |
| `healthFactor()` | — | `HealthFactorResult` |

### Exchange

| Method | Params | Returns |
|--------|--------|---------|
| `swap()` | `{ from, to, amount, maxSlippage? }` | `SwapResult` |
| `swapQuote()` | `{ from, to, amount }` | `{ expectedOutput, priceImpact, poolPrice, fee: { amount, rate } }` |

### Info

| Method | Params | Returns |
|--------|--------|---------|
| `rates()` | — | `RatesResult` |
| `positions()` | — | `PositionsResult` |
| `earnings()` | — | `EarningsResult` |
| `fundStatus()` | — | `FundStatusResult` |

### Sentinel

| Method | Params | Returns |
|--------|--------|---------|
| `sentinelList()` | — | `SentinelAgent[]` |
| `sentinelInfo()` | `id: string` | `SentinelAgent` |
| `sentinelAttack()` | `id: string, prompt: string, fee?: bigint` | `SentinelAttackResult` |

### Getters

| Getter | Returns |
|--------|---------|
| `agent.suiClient` | `SuiClient` |
| `agent.signer` | `Ed25519Keypair` |

### Events

| Event | Description |
|-------|-------------|
| `yield` | Yield earned notification |
| `balanceChange` | Balance changed |
| `healthWarning` | HF dropping, attention recommended |
| `healthCritical` | HF dangerous, action required |
| `gasStationFallback` | Gas resolution fell back to sponsor |
| `error` | SDK error |

---

## SDK Types (key interfaces)

```typescript
interface T2000Options {
  pin?: string;           // PIN to decrypt key file
  keyPath?: string;       // Path to key file (default: ~/.t2000/wallet.key)
  rpcUrl?: string;        // Custom Sui RPC URL
  passphrase?: string;    // @deprecated — use pin
  network?: 'mainnet' | 'testnet';
  sponsored?: boolean;
  name?: string;
}

interface BalanceResponse {
  available: number;
  savings: number;
  gasReserve: { sui: number; usdEquiv: number };  // GasReserve
  total: number;
  assets: Record<string, number>;
}

interface SendResult {
  success: boolean;
  tx: string;
  amount: number;
  to: string;
  gasCost: number;
  gasCostUnit: string;
  gasMethod: 'self-funded' | 'sponsored' | 'auto-topup';
  balance: BalanceResponse;
}

interface SaveResult {
  success: boolean; tx: string; amount: number;
  apy: number; fee: number; gasCost: number;
  gasMethod: GasMethod; savingsBalance: number;
}

interface WithdrawResult {
  success: boolean; tx: string; amount: number;
  gasCost: number; gasMethod: GasMethod;
}

interface BorrowResult {
  success: boolean; tx: string; amount: number;
  fee: number; healthFactor: number;
  gasCost: number; gasMethod: GasMethod;
}

interface RepayResult {
  success: boolean; tx: string; amount: number;
  remainingDebt: number; gasCost: number; gasMethod: GasMethod;
}

interface SwapResult {
  success: boolean; tx: string;
  fromAmount: number; fromAsset: string;
  toAmount: number; toAsset: string;
  priceImpact: number; fee: number;
  gasCost: number; gasMethod: GasMethod;
}
```

Source: `packages/sdk/src/types.ts`

---

## Error Codes

| Code | Description | Retryable |
|------|-------------|-----------|
| `INSUFFICIENT_BALANCE` | Not enough USDC | No |
| `INSUFFICIENT_GAS` | Not enough SUI for gas | Yes |
| `INVALID_ADDRESS` | Bad Sui address | No |
| `INVALID_AMOUNT` | Amount <= 0 or NaN | No |
| `WALLET_NOT_FOUND` | No key file at path | No |
| `WALLET_LOCKED` | Wrong PIN | No |
| `WALLET_EXISTS` | Key already exists at path | No |
| `SPONSOR_FAILED` | Sponsorship request failed | Yes |
| `SPONSOR_RATE_LIMITED` | Too many sponsor requests | Yes |
| `SPONSOR_UNAVAILABLE` | Sponsor service down | Yes |
| `GAS_STATION_UNAVAILABLE` | Gas station unreachable | Yes |
| `GAS_FEE_EXCEEDED` | Gas cost > $0.05 ceiling | No |
| `AUTO_TOPUP_FAILED` | USDC→SUI auto-swap failed | Yes |
| `SIMULATION_FAILED` | Dry-run failed | No |
| `TRANSACTION_FAILED` | On-chain execution failed | No |
| `ASSET_NOT_SUPPORTED` | Asset not in whitelist | No |
| `SLIPPAGE_EXCEEDED` | Price moved too much | Yes |
| `HEALTH_FACTOR_TOO_LOW` | Borrow would risk liquidation | No |
| `WITHDRAW_WOULD_LIQUIDATE` | Withdraw would drop HF below safe | No |
| `NO_COLLATERAL` | No savings to borrow against | No |
| `PROTOCOL_PAUSED` | t2000 contract paused | No |
| `PROTOCOL_UNAVAILABLE` | NAVI/Cetus unavailable | Yes |
| `RPC_ERROR` | Sui RPC error | Yes |
| `RPC_UNREACHABLE` | Sui RPC unreachable | Yes |
| `PRICE_EXCEEDS_LIMIT` | x402 price > maxPrice | No |
| `UNSUPPORTED_NETWORK` | x402 server not on Sui | No |
| `PAYMENT_EXPIRED` | x402 payment window expired | Yes |
| `DUPLICATE_PAYMENT` | x402 nonce already used | No |
| `FACILITATOR_REJECTION` | Facilitator rejected payment | No |
| `FACILITATOR_TIMEOUT` | Facilitator timed out | Yes |
| `UNKNOWN` | Unclassified error | Yes |

Source: `packages/sdk/src/errors.ts`

---

## Move Contract Abort Codes

| Code | Meaning |
|------|---------|
| 1 | Protocol is temporarily paused (`EPAUSED`) |
| 2 | Amount must be greater than zero (`EZERO_AMOUNT`) |
| 3 | Invalid operation type (`EINVALID_OPERATION`) |
| 4 | Fee rate exceeds maximum (`EFEE_RATE_TOO_HIGH`) |
| 5 | Insufficient treasury balance (`EINSUFFICIENT_TREASURY`) |
| 6 | Not authorized (`ENOT_AUTHORIZED`) |
| 7 | Package version mismatch (`EVERSION_MISMATCH`) |
| 8 | Timelock is active (`ETIMELOCK_ACTIVE`) |
| 9 | No pending change to execute (`ENO_PENDING_CHANGE`) |

Source: `packages/sdk/src/errors.ts` → `mapMoveAbortCode()`

---

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MIST_PER_SUI` | `1_000_000_000n` | SUI base units per SUI |
| `SUI_DECIMALS` | `9` | |
| `USDC_DECIMALS` | `6` | |
| `BPS_DENOMINATOR` | `10_000n` | Basis points denominator |
| `PRECISION` | `1_000_000_000_000_000_000n` (10^18) | Reward math precision (matches contract) |
| `MIN_DEPOSIT` | `1_000_000n` (1 USDC) | Minimum deposit |
| `GAS_RESERVE_USDC` | `1_000_000n` ($1) | USDC reserved for gas on `save all` |
| `AUTO_TOPUP_THRESHOLD` | `50_000_000n` (0.05 SUI) | SUI balance below this triggers topup |
| `AUTO_TOPUP_AMOUNT` | `1_000_000n` ($1 USDC) | Amount swapped per topup |
| `AUTO_TOPUP_MIN_USDC` | `2_000_000n` ($2) | Min USDC required to trigger topup |
| `BOOTSTRAP_LIMIT` | `10` | Max sponsored bootstrap transactions |
| `GAS_FEE_CEILING_USD` | `$0.05` | Max gas fee before rejection |
| `CLOCK_ID` | `'0x6'` | Sui Clock shared object |
| `DEFAULT_SLIPPAGE` | `3%` | Default swap slippage (CLI `--slippage` default) |
| `DEFAULT_RATE_LIMIT` | `10 req/s` | Default HTTP API rate limit (CLI `--rate-limit` default) |

Source: `packages/sdk/src/constants.ts` (core constants), `packages/cli/src/commands/*.ts` (CLI defaults)

---

## Contract Object IDs (Mainnet)

### t2000 Protocol

| Object | ID |
|--------|----|
| Package | `0x51c44bb2ad3ba608cf9adbc6e37ee67268ef9313a4ff70957d4c6e7955dc7eef` |
| Config | `0xd30408960ac38eced670acc102df9e178b5b46b3a8c0e96a53ec2fd3f39b5936` |
| Treasury (USDC) | `0x2398c2759cfce40f1b0f2b3e524eeba9e8f6428fcb1d1e39235dd042d48defc8` |

> **Note:** AdminCap and UpgradeCap IDs are intentionally omitted — stored in `.env.local` only.

### x402 Payment Kit (Sui Payment Kit)

| Object | ID |
|--------|----|
| Package | `0xbc126f1535fba7d641cb9150ad9eae93b104972586ba20f3c60bfe0e53b69bc6` |
| Payment Registry | `0x4009dd17305ed1b33352b808e9d0e9eb94d09085b2d5ec0f395c5cdfa2271291` |

### Sui Sentinel (Partner — Red Teaming)

| Object | ID |
|--------|----|
| Package | `0x88b83f36dafcd5f6dcdcf1d2cb5889b03f61264ab3cee9cae35db7aa940a21b7` |
| Agent Registry | `0xc47564f5f14c12b31e0dfa1a3dc99a6380a1edf8929c28cb0eaa3359c8db36ac` |
| Enclave | `0xfb1261aeb9583514cb1341a548a5ec12d1231bd96af22215f1792617a93e1213` |
| Protocol Config | `0x2fa4fa4a1dd0498612304635ff9334e1b922e78af325000e9d9c0e88adea459f` |

> Sentinel integration: SDK (`protocols/sentinel.ts`), CLI (`t2000 sentinel list|info|attack`), and `t2000-sentinel` skill.
> Docs: https://docs.suisentinel.xyz | App: https://app.suisentinel.xyz

---

## Infrastructure

| Component | URL / Location |
|-----------|---------------|
| Website | `https://t2000.ai` (Vercel) |
| Docs | `https://t2000.ai/docs` |
| API | `https://api.t2000.ai` (ECS Fargate, ALB) |
| x402 Facilitator | `https://api.t2000.ai/x402` |
| npm (SDK) | `https://www.npmjs.com/package/@t2000/sdk` |
| npm (CLI) | `https://www.npmjs.com/package/@t2000/cli` |
| npm (x402) | `https://www.npmjs.com/package/@t2000/x402` |
| GitHub | `https://github.com/mission69b/t2000` |
| Network | Sui mainnet |

---

## Gas Resolution Chain

1. **Self-funded** — agent has enough SUI
2. **Auto-topup** — SUI < 0.05 and USDC >= $2 → swap $1 USDC to SUI (swap itself is sponsored)
3. **Sponsored** — fallback for bootstrap (up to 10 txs)

---

## x402 Protocol

| Fact | Value |
|------|-------|
| Import | `import { x402Client } from '@t2000/x402'` |
| Wallet type | `X402Wallet` (custom interface, NOT the T2000 class directly) |
| Facilitator URL | `https://api.t2000.ai/x402` |
| Verify endpoint | `POST /x402/verify` |
| Settle endpoint | `POST /x402/settle` |
| Info endpoint | `GET /x402` (returns JSON with facilitator info) |
| Replay protection | On-chain nonce via Sui Payment Kit |
| Payment event | `PaymentReceipt` (from Payment Kit) |
