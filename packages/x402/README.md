# @t2000/sui-x402

x402 payment dialect for Sui — scheme `exact`, sign-then-settle gasless USDC.
Used by `@t2000/serve` (seller) and `@t2000/sdk` (buyer):

- **Requirements** — `createX402Requirements` builds the `accepts[]` entry a
  402 advertises (challenge-bound via `extra.suimpp` — wire field name; see
  scheme docs).
- **Payment** — `buildX402SignedPayment` builds + signs the gasless transfer
  without submitting; the seller settles.
- **Verify + settle** — `verifyX402Payment` / `settleX402Payment`.
  No-charge-on-failure is structural.
- **Replay store** — `DigestStore` / `InMemoryDigestStore`.
- **Escrow routing** — `isX402EscrowRequirements` / `isX402EscrowHeader` so
  instant and escrow flows never cross.

```ts
import { createX402Requirements, USDC } from '@t2000/sui-x402';
```

Wire is stable: scheme `exact`, `X-PAYMENT` / `X-PAYMENT-RESPONSE`, and the
`extra.suimpp` extension bag. Renaming those fields is a protocol bump, not a
package rename.

> Was briefly named `@t2000/x402`; the npm name is `@t2000/sui-x402` after
> that name's unpublish tombstone.

MIT © t2000
