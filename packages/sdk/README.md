# @t2000/sdk

TypeScript SDK for AI agent wallets on Sui. Send USDC, earn yield via NAVI Protocol, swap on Cetus, borrow against collateral — all from a single class.

## Install

```bash
npm install @t2000/sdk
```

## Quick Start

```typescript
import { T2000 } from '@t2000/sdk';

const agent = await T2000.create({ passphrase: 'my-secret' });

// Check balance
const balance = await agent.balance();
console.log(`$${balance.available} USDC available`);

// Send USDC
await agent.send({ to: '0x...', amount: 10 });

// Save (earn yield via NAVI Protocol)
await agent.save({ amount: 50 });

// Swap USDC → SUI (via Cetus)
await agent.swap({ from: 'USDC', to: 'SUI', amount: 5 });

// Borrow against savings
await agent.borrow({ amount: 20 });
```

## Features

| Feature | Method | Description |
|---------|--------|-------------|
| **Send** | `agent.send()` | Transfer USDC to any Sui address |
| **Balance** | `agent.balance()` | Available + savings + gas reserve |
| **Save** | `agent.save()` | Deposit to NAVI Protocol (earn APY) |
| **Withdraw** | `agent.withdraw()` | Withdraw from savings |
| **Swap** | `agent.swap()` | USDC/SUI via Cetus CLMM |
| **Borrow** | `agent.borrow()` | Borrow against collateral |
| **Repay** | `agent.repay()` | Repay outstanding borrows |
| **Health** | `agent.healthFactor()` | Lending health factor |
| **Earnings** | `agent.earnings()` | Yield earned to date |
| **Rates** | `agent.rates()` | Current save/borrow APYs |
| **Positions** | `agent.positions()` | All open DeFi positions |

## Key Management

```typescript
import { generateKeypair, saveKey, loadKey, exportPrivateKey } from '@t2000/sdk';

// Generate and save
const keypair = generateKeypair();
await saveKey(keypair, 'passphrase');

// Load existing
const loaded = await loadKey('passphrase');

// Export (bech32 format)
const privkey = exportPrivateKey(loaded);
```

## Events

```typescript
agent.on('balanceChange', (e) => {
  console.log(`${e.cause}: ${e.asset} changed`);
});

agent.on('healthWarning', (e) => {
  console.log(`Health factor: ${e.healthFactor}`);
});

agent.on('yield', (e) => {
  console.log(`Earned: $${e.earned}`);
});
```

## Gas Abstraction

Gas is handled automatically:
1. **Self-funded** — uses agent's SUI balance
2. **Auto-topup** — swaps $1 USDC → SUI when gas is low
3. **Sponsored** — gas station fallback for zero-SUI agents

Every transaction result includes `gasMethod` indicating which strategy was used.

## License

MIT
