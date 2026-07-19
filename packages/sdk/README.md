# @t2000/sdk

The TypeScript SDK for Agent Wallets on Sui. One class (`T2000`) — wallet signing, gasless USDC + USDsui sends, Cetus swap routing, and x402 paid-API access (pay any API in USDC, no keys).

[![npm @t2000/sdk](https://img.shields.io/npm/v/@t2000/sdk?label=%40t2000%2Fsdk)](https://www.npmjs.com/package/@t2000/sdk)
[![npm @t2000/cli](https://img.shields.io/npm/v/@t2000/cli?label=%40t2000%2Fcli)](https://www.npmjs.com/package/@t2000/cli)
[![docs](https://img.shields.io/badge/docs-developers.t2000.ai-00D395)](https://developers.t2000.ai/agent-sdk)
[![license](https://img.shields.io/badge/license-MIT-blue)](https://github.com/mission69b/t2000/blob/main/LICENSE)

## Install

```bash
npm install @t2000/sdk
```

Requires Node.js 18+ · TypeScript 5+ recommended.

## Quick start

```typescript
import { T2000 } from '@t2000/sdk';

const { agent, address } = await T2000.init();        // new wallet (Bech32, 0o600 perms)
const agent = await T2000.create();                   // load from ~/.t2000/wallet.key
const agent = T2000.fromPrivateKey('suiprivkey1…');   // in-memory load (no file)

await agent.send({ to: 'alice.sui', amount: 5, asset: 'USDC' });   // gasless
await agent.swap({ from: 'USDC', to: 'SUI', amount: 100 });         // Cetus, needs SUI
await agent.pay({ url: 'https://mpp.t2000.ai/openai/v1/chat/completions', method: 'POST', body, maxPrice: 0.10 });
```

USDC + USDsui sends and x402 USDC payments are gasless (Sui foundation's `0x2::balance::send_funds` sponsor). SUI sends and Cetus swaps need gas — keep ~0.05 SUI on hand.

The SDK also ships the **escrow-job builders** for agent-to-agent deliverable work (`t2000::a2a_escrow` on Sui mainnet): `buildCreateJobTx` / `buildDeliverJobTx` / `buildReleaseJobTx` / `buildRejectJobTx` / `buildRefundJobTx`, plus `getJob`, `jobActionsFor`, and `verifyJobForSeller`. 5% protocol fee on the seller payout at settlement; refunds fee-free.

## Full reference

Factory methods, full API surface, supported assets, Cetus swap routing, x402 payments, error handling, architecture →
**[developers.t2000.ai/agent-sdk](https://developers.t2000.ai/agent-sdk)**

## License

MIT — see [LICENSE](https://github.com/mission69b/t2000/blob/main/LICENSE).
