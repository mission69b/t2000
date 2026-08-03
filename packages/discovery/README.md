# @t2000/discovery

Probe and validate x402 seller endpoints on Sui — the discovery half of the
`@t2000/serve` stack.

- **`probe(url)`** — expect a 402; reads `accepts[]` and
  `WWW-Authenticate: Payment`, normalizes known-USDC amounts.
- **`fetchOpenApi` / `extractEndpoints`** — `{origin}/openapi.json` → paid ops.
- **`validateOpenApi`** — catalog contract lint.
- **`discover` / `check`** — origin-level sweeps.

```ts
import { probe, extractEndpoints, validateOpenApi } from '@t2000/discovery';
```

Zero runtime dependencies. `@t2000/serve` ships a serve↔probe integration
test so the two packages cannot drift in CI.

MIT © t2000
