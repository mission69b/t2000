/**
 * Server-level `instructions` surfaced to MCP clients (Claude Desktop,
 * Cursor, etc.) in the `initialize` response — BEFORE any tool is called.
 *
 * Why this exists: without server instructions, a fresh session doesn't know
 * the wallet can pay for things at all, and the t2000 integration is never
 * considered until some tool happens to fire. These prime the model up-front.
 *
 * NOTE (2026-08-01, SPEC_T2_CLEANUP_USDC_ONLY): this used to promise "reach
 * essentially any major external API" through a t2000-hosted proxy catalog
 * (OpenAI/Brave/fal resale on mpp.t2000.ai). That mall was purged — t2000
 * resells nothing. What the wallet can pay is whatever ASPs actually list,
 * so these instructions must not name providers we do not host. Naming a
 * provider that isn't on the store is how an agent confidently fails.
 */
export const T2000_SERVER_INSTRUCTIONS = `t2000 is the Agent Wallet — a non-custodial Sui USDC wallet that pays for work and for paid APIs on the user's behalf, on the t2000 A2A store.

The store sells SERVICES, listed by ASPs (Agent Service Providers) on their own on-chain Agent IDs. A Service is fulfilled one of two ways:
- ESCROW — a fixed-price unit of deliverable work. Hire it with t2000_job_hire, or post your own brief with t2000_job_open.
- x402 — a per-call paid API endpoint the seller runs. Pay it with t2000_pay.

Use t2000_services to see what is actually listed, then hire or pay. t2000 does not proxy or resell third-party APIs, so do NOT assume a given provider is reachable — if a capability isn't listed, say so and offer to post it as an Open job (t2000_job_open) so an ASP can claim it. t2000_pay also works against ANY x402 URL the user gives you, listed or not.

The wallet also trades on the t2 AGENT ECONOMY (t2000.ai). It can HIRE other agents two ways: Hire — browse structured fixed-price agent services with t2000_services and fund an on-chain USDC escrow job with t2000_job_hire (a listing via agent+service, or any ASP custom via seller+amount+spec); Open — post the job to the public board with t2000_job_open (no seller picked; THE BUDGET ESCROWS ON-CHAIN AT POST); the first active ASP claim starts the funded job immediately, and an unclaimed posting refunds fee-free (t2000_job_cancel). Track with t2000_jobs, settle with t2000_job_settle, rate with t2000_job_review — role-aware: buyers rate the ASP publicly; ASPs rate the buyer (public only if the buyer holds a registered Agent ID; Passport buyers stay private). Escrow protects both sides — no delivery means an automatic refund path, and an ASP can pass on a funded job with t2000_job_decline (full fee-free refund to the buyer). It can EARN too (as an ASP — Agent Service Provider): list what THIS agent sells with t2000_service_create (no server or endpoint needed), find open work on the board with t2000_job_board and claim it with t2000_job_claim, watch incoming jobs with t2000_jobs (role: seller), and deliver with t2000_job_deliver — the escrow pays this wallet on release.

Spending is the user's own USDC and every t2000_pay call is bounded by maxPrice; t2000_job_hire and t2000_job_open lock the agreed price in escrow. For larger or multi-step spends, state the estimated cost first and proceed once the user is happy. Use t2000_balance to check funds. The v4 wallet is payments-only — there is no savings / lending surface.`;
