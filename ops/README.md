# ops/

Operational handoffs that are **not** product UI copy and **not** Mintlify docs.

| File | What |
|---|---|
| [`TEST-PLAN-MARKETPLACE.md`](./TEST-PLAN-MARKETPLACE.md) | Manual QA — t2000 console + Claude Passport Connect |
| [`DOGFOOD-OPEN-JOBS.md`](./DOGFOOD-OPEN-JOBS.md) | Paste-ready Open job prompts (dogfood + growth) + Connect spend limits how-to |
| [`open-jobs/PROMPT-GTM-DESK.md`](./open-jobs/PROMPT-GTM-DESK.md) | **One paste, any seat — metrics-first**: posts the 50 protocol-pack jobs — briefs tagged `PACK: protocol-metrics` (≈$6.74/seat, `TARGET_METRICS=50`); social/referral are an off-by-default appendix (`TARGET_SOCIAL=0`) |
| [`open-jobs/PROMPT-GTM-SETTLE.md`](./open-jobs/PROMPT-GTM-SETTLE.md) | Inbox-only settle/reject/rate — no posting; **3×/day** (§ Metrics · § Social · § Referral · § Micro) |
| [`open-jobs/PROMPT-50-PROTOCOL-METRICS.md`](./open-jobs/PROMPT-50-PROTOCOL-METRICS.md) | **Preferred seed** — 50 jobs ($0.05–$0.20 + $0.50 register, Σ $6.74) that move the honest counters: registered · posted · claimed · released · reviews · full `[MCP]` lifecycle |
| [`open-jobs/PROMPT-50-MICRO-ACTIVITY-JOBS.md`](./open-jobs/PROMPT-50-MICRO-ACTIVITY-JOBS.md) | Alt seed — 50 micro dogfood jobs ($6.00) |
| [`open-jobs/PROMPT-GTM-MICRO-IDEAS.md`](./open-jobs/PROMPT-GTM-MICRO-IDEAS.md) | GTM job backlog ideas |
| [`open-jobs/REFERRAL-SETTLE-LEDGER.md`](./open-jobs/REFERRAL-SETTLE-LEDGER.md) | Cross-seat settled referred/proof ids |
| [`open-jobs/SOCIAL-COMMENT-SETTLE-LEDGER.md`](./open-jobs/SOCIAL-COMMENT-SETTLE-LEDGER.md) | Cross-seat settled comment permalinks |
| [`open-jobs/AGENT-REGISTER-SETTLE-LEDGER.md`](./open-jobs/AGENT-REGISTER-SETTLE-LEDGER.md) | Cross-seat settled register bounties — one payout per numeric Agent ID, ever |
| [`dune/DASHBOARD.md`](./dune/DASHBOARD.md) | Dune pitch queries (defining-package filters) |

**Keep here:** test plans, event runbooks, release smoke checklists for humans/testers.

**Not here:** brand tokens/voice (`brandkit/`), developer docs (`apps/docs/`), internal SPECs (`spec/` gitignored).

**Not here for marketing pitch sheets** — use `brandkit/MARKETING-ONEPAGER.md` unless you prefer event packs under `ops/events/` later.
