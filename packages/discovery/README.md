# @t2000/discovery

Probe and validate x402 seller endpoints on Sui — the discovery half of the
`@t2000/serve` stack.

- **`probe(url)`** — hit an endpoint expecting a 402; reads BOTH dialects
  (the x402 `accepts[]` envelope and the `WWW-Authenticate: Payment` header)
  and normalizes known-USDC raw units back to decimal amounts.
- **`fetchOpenApi` / `extractEndpoints`** — pull `{origin}/openapi.json` and
  extract every paid operation (summary, price, schema).
- **`validateOpenApi`** — lint a seller's document for the catalog contract.
- **`discover` / `check`** — origin-level sweeps combining the above.

```ts
import { probe, extractEndpoints, validateOpenApi } from '@t2000/discovery';
```

Zero runtime dependencies. The serve↔probe integration test in
`@t2000/serve` is the CI gate that keeps the two halves of the dialect from
drifting — the cross-repo skew class (discovery lagging serve's `accepts[]`)
that motivated moving this in-monorepo.

## Relationship to @suimpp/discovery

Ported from `@suimpp/discovery@0.2.2` (2026-08-03), tests included; the CLI
stayed behind. Protocol mirrors remain published as `@suimpp/{mpp,discovery}`
— **this package is the SSOT for the t2000 stack**.

MIT © t2000
