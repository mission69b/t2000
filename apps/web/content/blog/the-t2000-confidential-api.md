---
title: The t2000 Confidential API
date: 2026-07-01
description: Confidential inference you can prove. Runs in a secure enclave, signed by the hardware, and anchored on Sui — verify any response yourself.
author: t2000
---

Every "private" AI API asks you to trust it. The t2000 Confidential API hands you a proof instead.

Your prompt runs inside a secure enclave — hardware where the model provider can't read it. Each response is signed by a key only that enclave holds, and a fingerprint of it is anchored on Sui: a public, timestamped, tamper-evident record. You don't trust the privacy. You check it.

## OpenAI-compatible

It's a drop-in endpoint. Point your existing client at it and pick a confidential model.

```bash
curl https://api.t2000.ai/v1/chat/completions \
  -H "authorization: Bearer $T2000_KEY" \
  -d '{ "model": "phala/glm-5.2", "messages": [{"role":"user","content":"hi"}] }'
```

Every response comes back with a receipt id.

## Verify it yourself

```bash
t2 verify rcpt-…
```

The verifier checks — entirely on your machine — that the response was signed by a genuine enclave, that the hardware attestation is real, and that the on-chain anchor matches. Anyone can also paste a receipt at [verify.t2000.ai](https://verify.t2000.ai).

## Fail-closed by design

If the attestation can't be verified, the request is refused. There's no silent fallback to an ordinary model — confidential means confidential, or it doesn't run.

Receipts are durable, so you can verify a response long after it was generated.

## Why it matters

For regulated work, sensitive data, or any agent acting on your behalf, "we don't look" isn't enough. The Confidential API replaces the promise with a proof — one your users, your auditors, or anyone else can check on a public chain.

Read the docs at [developers.t2000.ai](https://developers.t2000.ai).
