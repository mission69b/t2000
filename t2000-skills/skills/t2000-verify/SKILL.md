---
name: t2000-verify
description: >-
  Check — don't trust — a confidential (GPU-TEE) AI response by its receipt id.
  Use when asked to verify, prove, or audit that an AI response ran in a genuine
  hardware enclave (Intel TDX), wasn't tampered with, and is anchored on Sui.
  Works on any t2000 Private API confidential (`phala/*`) response. No key needed.
license: MIT
metadata:
  author: t2000
  version: "1.0"
  requires: t2000 CLI (npm install -g @t2000/cli)
---

# t2000: Verify a Confidential Response

## Purpose

Confidential (`phala/*`) responses from the t2000 Private API run inside a verified
GPU-TEE and carry a **signed receipt** that's **auto-anchored on Sui**. `t2 verify`
checks the whole chain **client-side** and **fails closed** on any forgery — you (or
your agent) prove the response is genuine without trusting t2000.

## Where the receipt id comes from

Any confidential inference call returns one:

```bash
t2 chat --model phala/glm-5.2 "…"     # → 🔒 confidential · attested · receipt rcpt-…
```

The API returns it in the `x-receipt-id` header (streaming: `x_receipt_id` on the
final usage chunk). Any `phala/*` model is confidential; non-`phala/*` responses
aren't (nothing to verify).

## Command

```bash
t2 verify <receipt-id>            # full check (incl. client-side Intel TDX quote)
t2 verify <receipt-id> --quick    # skip the slower DCAP quote check
t2 verify <receipt-id> --json     # machine-readable per-check result
```

No API key required — verification is public + trustless.

## What it checks (fails closed on any mismatch)

- **Receipt** — well-formed signed transparency log (hashes, never your prompt).
- **Confidential upstream** — the upstream was an attested TEE (typed TCB claims).
- **Sui anchor (trustless)** — reads the on-chain `ReceiptAnchored` event straight
  from a fullnode; confirms the committed `wire_hash` + `workload_id` match. t2000
  can't forge it.
- **Receipt signature (trustless)** — recovers the signer, matches the attested key.
- **TDX quote / DCAP (trustless)** — re-verifies the hardware quote against Intel's
  root CA locally (skip with `--quick`).

Exit code is non-zero if anything doesn't line up.

## Other surfaces

- **Browser:** paste any receipt id at **`verify.t2000.ai`** — same checks + a live
  public feed of every confidential response anchored on Sui.
- **MCP:** the `t2000_verify` tool takes a `receiptId` and returns the per-check
  result (`verified:false` on any forgery). No key required.
- **SDK:** `verifyReceipt(receiptId)` from `@t2000/sdk`; `agent.verify(id)` on a
  `T2000` instance.

## Honest framing (don't overclaim)

Verified = genuine TDX + TEE-signed receipt + Sui anchor, all checked client-side —
that's trustless. What it does NOT claim: the gateway's forwarding leg still sees
plaintext (zero data retention, but not end-to-end encrypted — that's a future
rung). State exactly what's proven; a wrong "verified" claim is worse than honest.
