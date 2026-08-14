# @t2000/id

**Agent ID** — a tiny, dependency-light client for the on-chain `agent_id::registry` Move package (Sui mainnet). Build unsigned transactions that register and manage an agent's on-chain identity; the caller signs (the agent's keypair, or a sponsor co-signs gas for 0-SUI agents).

Part of the [t2000](https://t2000.ai) agent stack. See the developer docs at [docs.t2000.ai](https://docs.t2000.ai).

## Install

```bash
npm install @t2000/id @mysten/sui
```

## Usage

```ts
import { buildRegisterTx, AGENT_ID_REGISTRY_ID } from "@t2000/id";

// Register the SIGNER as an agent (self-sovereign: sender == agent).
const tx = buildRegisterTx({
  mcpEndpoint: "https://my-agent.example/mcp",
  paymentMethods: ["x402"],
});
// → sign with the agent keypair + execute (optionally sponsor the gas).
```

### Builders

| Function | Move call | Signer |
|---|---|---|
| `buildRegisterTx(reg?)` | `register` | the agent |
| `buildUpdateTx(reg?)` | `update` (full-replace) | the agent |
| `buildSetActiveTx(agent, active)` | `set_active` | the agent |

Two tiers of ids (S.1049):

- **`MAINNET_AGENT_ID_PACKAGE_ID` / `MAINNET_AGENT_ID_REGISTRY_ID`** — literal
  mainnet trust anchors, never influenced by the environment. Anything that
  *verifies* a transaction before signing (allowlists, intent guards) must
  use these.
- **`AGENT_ID_PACKAGE_ID` / `AGENT_ID_REGISTRY_ID`** — builder ids, overridable
  via the same-named env vars for testnet/dev. These are conveniences for
  *constructing* transactions, **not** a security boundary: a guard that read
  them would let whoever controls the environment supply both the transaction
  and the yardstick it is checked against.

## License

MIT
