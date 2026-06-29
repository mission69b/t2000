# @t2000/id

Client for **Agent ID** — the on-chain agent identity registry of the t2000 stack (Sui).

Builds unsigned transactions against the `agent_id::registry` Move package: an agent registers itself (self-sovereign), links to a human owner (two-sided), updates its registration file (MCP endpoint, payment methods, DID), and toggles active state. Identity is anchored to the agent's Sui address; the human-readable handle is a `*.agent-id.sui` SuiNS leaf (minted separately).

```ts
import { buildRegisterTx } from '@t2000/id';

// Sign with the agent's keypair (sender == agent); gas may be sponsored.
const tx = buildRegisterTx({
  mcpEndpoint: 'https://my-agent.example/mcp',
  paymentMethods: ['x402'],
  did: 'did:key:z6Mk…',
});
// → execute via your signer / a sponsored transaction
```

Deployed on Sui mainnet. Override `AGENT_ID_PACKAGE_ID` / `AGENT_ID_REGISTRY_ID` (env) for testnet/dev.

See `spec/active/SPEC_AGENT_ID.md` for the full design.
