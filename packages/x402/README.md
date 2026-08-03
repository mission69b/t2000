# @t2000/x402

The x402 payment dialect for Sui — scheme `exact`, sign-then-settle gasless
USDC. This package is what `@t2000/serve` (seller side) and `@t2000/sdk`
(buyer side) speak to each other:

- **Requirements** — `createX402Requirements` builds the `accepts[]` entry a
  402 response advertises (challenge-bound via `extra.suimpp`).
- **Payment** — `buildX402SignedPayment` builds + signs the canonical gasless
  transfer **without submitting**; settlement is the seller's job.
- **Verify + settle** — `verifyX402Payment` (structural, no RPC) and
  `settleX402Payment` (submit the buyer-signed bytes, confirm the balance
  change, record the digest). No-charge-on-failure is structural.
- **Replay store** — `DigestStore` / `InMemoryDigestStore` (settle-once).
  Production sellers supply a durable store.
- **Escrow routing** — `isX402EscrowRequirements` / `isX402EscrowHeader`
  discriminate job-class (escrow) entries and credentials so instant and
  escrow flows never cross.

```ts
import { createX402Requirements, USDC } from '@t2000/x402';
```

## Wire format

The wire format is the **protocol SSOT and is unchanged** from `@suimpp/mpp`:
scheme `exact`, the `X-PAYMENT` / `X-PAYMENT-RESPONSE` headers, and the
`extra.suimpp` field names stay exactly as published — package branding never
touches the wire.

## Relationship to @suimpp/mpp

Seeded from `@suimpp/mpp`'s `./x402` surface (2026-08-03) plus the shared
digest store and USDC currency constants. Protocol mirrors remain published
as `@suimpp/{mpp,discovery}` — dual-publish/re-export from the suimpp repo is
a follow-up; **this package is the SSOT for the t2000 stack**. The mppx pay
loop (Method / Credential / Receipt / WWW-Authenticate) is deliberately NOT
here — it lives in `mppx` + `@suimpp/mpp` only, as do the escrow-credential
builder helpers this stack doesn't consume.

MIT © t2000
