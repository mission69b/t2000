// [SPEC_T2000_SERVE slice 4] The agent-executable seller guide. A coding
// agent (or a human with curl) can take its API from zero to listed by
// following this file top to bottom — it is the machine twin of the /sell
// page and the developers.t2000.ai Sell-to-agents docs. Served at
// mpp.t2000.ai/sellers.md.
//
// The one-prompt pattern (paste into any coding agent):
//   "Read https://mpp.t2000.ai/sellers.md and follow it to make my API
//    discoverable and payable by agents. Only ask me questions if you need
//    input you can't determine yourself."
const GUIDE = `# Sell your API on the t2000 rail

> List a paid API on t2 Agents (https://agents.t2000.ai) + the MPP catalog
> (https://mpp.t2000.ai). No account, no sign-up, no signature — your API is
> the account. This guide is agent-executable: follow it top to bottom.
>
> This is the PER-CALL path (you run the API). To sell deliverable work with
> NO server — a fixed-price service on your Agent ID that buyers fund into an
> on-chain escrow — use \`t2 service create\` instead:
> https://developers.t2000.ai/sell-to-agents/overview

## How it works

1. Your API answers HTTP 402 with an x402 payment challenge naming your Sui
   wallet. The buyer signs a gasless USDC payment against that challenge and
   retries with the \`X-PAYMENT\` header; your API verifies it, runs the
   handler, submits the payment on-chain, and serves the response.
2. You submit your endpoint URL. Machines check it (no humans):
   - it answers 402 with a payable challenge
   - the challenge carries an x402 \`accepts[]\` envelope (REQUIRED)
   - every listed price is ≤ 5 USDC per call
3. Listed. Your store page is https://agents.t2000.ai/<your-payTo-wallet> —
   every sale settles on-chain and shows on your page as reputation.

Manage by managing your API: change your price → the daily re-probe updates
the listing. Stop serving 402 → suspended. Restore it → relisted. Resubmit
the URL any time to revalidate instantly.

## Step 1 — make your API payable with @t2000/serve (Node/TS)

Do NOT hand-roll the payment protocol. The x402-on-Sui dialect is
sign-then-settle: the buyer sends signed transaction bytes, and YOUR side
must structurally verify them, submit them on-chain, confirm the balance
change, and keep replay state — getting any of it wrong fails silently
(your endpoint looks live; buyers quietly can't pay you, or worse, get
charged for errors). \`@t2000/serve\` is that whole protocol, correct by
construction:

\`\`\`bash
npm install @t2000/serve
\`\`\`

\`\`\`ts
// app/api/search/route.ts (Next.js — also works with Bun/Deno/Hono via serve.fetch)
import { z } from 'zod';
import { createServeFromEnv } from '@t2000/serve';

const serve = createServeFromEnv(); // reads T2000_PAY_TO from env

const input = z.object({ query: z.string().min(1) });

export const POST = serve
  .route({ path: 'search', description: 'What this call does' })
  .paid('0.02')                          // USDC per call
  .body(input, z.toJSONSchema(input))    // validated BEFORE payment — invalid input is never charged
  .handler(async ({ body, payer }) => yourExistingLogic(body));
\`\`\`

- \`T2000_PAY_TO\` = YOUR Sui wallet — payment settles straight to it and it
  becomes your seller identity + store page address. No wallet?
  \`npm i -g @t2000/cli && t2 init && t2 fund\` prints one.
- Your server never holds a key and never pays gas — settlement submits the
  BUYER's signed gasless transaction.
- A failed handler never charges the buyer (the payment is only submitted
  after your handler succeeds).
- Serverless (Vercel/Lambda)? Set \`KV_REST_API_URL\` + \`KV_REST_API_TOKEN\`
  (Upstash-compatible) so replay protection is durable across instances.

Starting from zero instead of wrapping an existing app? Clone the deployable
template — one paid route, discovery docs, a Deploy-with-Vercel button:
https://github.com/mission69b/t2000/tree/main/examples/serve-vercel

Not on Node? See "Hand-rolling the protocol (any language)" at the bottom.

## Step 2 — serve discovery docs

\`\`\`ts
// app/openapi.json/route.ts        // app/llms.txt/route.ts
export const GET = serve.openapi(); export const GET = serve.llms();
\`\`\`

\`/openapi.json\` is OpenAPI 3.1 with the \`x-payment-info\` pricing extension
per paid operation; \`/llms.txt\` is plain-text agent guidance. With them:
every priced route is listed, your name + description become your listing,
and buyers' agents build request bodies from your schemas (no paid guessing
errors). Set \`T2000_NAME\` + \`T2000_DESCRIPTION\` in env.

## Step 3 — test, then submit the URL

\`\`\`bash
npm i -g @t2000/cli

# All gates + listing-quality grade, dry run (nothing paid or listed):
t2 check https://your-api.example/search

# Funded end-to-end (pays your real price; needs a funded wallet — t2 init):
t2 pay https://your-api.example/search --data '{"query":"test"}' --max-price 0.05

# List it:
curl -X POST https://mpp.t2000.ai/api/catalog/submit \\
  -H 'content-type: application/json' \\
  -d '{"url":"https://your-api.example/search"}'
\`\`\`

The submit response lists every gate result plus listing-quality warnings
(each warning includes a prompt you can paste into your coding agent to fix
it). On success it returns your catalog URL and your store page URL.
Dry-run the identical checks first with \`/api/catalog/preview\`. Prefer a
browser? https://mpp.t2000.ai/sell is the same thing with a paste box.

## Step 4 — claim your page (optional, never required to earn)

Your listing works and earns unclaimed. Claiming = registering an Agent ID
on your payTo wallet — it upgrades your store page with a verified badge and
a custom profile (name, avatar, links), and unlocks job-class (escrow)
selling (see "Sell jobs" below).

Only the payTo key can claim (registration is signed by that wallet — a
Google/Passport session can never prove control of it). On the machine that
holds the key:

\`\`\`bash
npm i -g @t2000/cli
t2 init --import <payTo-secret>   # skip if ~/.t2000/wallet.key IS the payTo wallet
t2 agent register                 # free + gasless — this IS the claim
t2 agent profile                  # optional: display name, description, links
\`\`\`

Optional: manage the claimed page from a browser. Propose your human's
Passport as owner (\`t2 agent link <passport-address>\`), then they confirm
once at https://agents.t2000.ai/manage/agents (Google sign-in).

## Sell jobs (escrow) — deliverable work, not instant calls

Instant calls settle-then-serve. JOBS (research reports, builds, SLA work)
need funds committed BEFORE delivery starts — so they settle through an
on-chain escrow object (\`a2a_escrow\` on Sui mainnet), never through this
rail. To list a job-class service, your 402 advertises escrow TERMS instead
of a payment challenge:

\`\`\`json
{
  "x402Version": 1,
  "accepts": [{
    "scheme": "exact",
    "network": "sui:mainnet",
    "payTo": "0xYOUR_SUI_WALLET",
    "maxAmountRequired": "5000000",
    "asset": "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
    "resource": "https://your-api.example/jobs/research-report",
    "extra": { "escrow": {
      "deliverWithinMs": 86400000,
      "reviewWindowMs": 3600000,
      "rejectSplitBps": 8000
    } }
  }]
}
\`\`\`

- \`maxAmountRequired\` is the JOB price (atomic USDC): "5000000" = 5 USDC.
- \`deliverWithinMs\` — your delivery commitment from job creation.
- \`reviewWindowMs\` — the buyer's accept/reject window after you deliver
  (lapse = release to you; anyone can crank it).
- \`rejectSplitBps\` — the buyer's share in basis points if they reject
  (8000 = 80% back to the buyer, 20% to you). Fixed at job creation.

Flow: the buyer runs \`t2 job create <usdc> <your-payTo> --spec brief.md\`
(funds lock in a shared Job object), presents the Job id as the X-PAYMENT
credential, and you verify it ON-CHAIN before starting work
(\`t2 job verify <jobId>\` or \`verifyJobForSeller\` in @t2000/sdk — funded,
pays you, covers the price). Deliver with \`t2 job deliver\`; funds release
to your wallet on acceptance or when the review window lapses. Miss the
deadline and the buyer reclaims everything — deliver or it costs you.

Job-class rules (on top of the general gates):
- Your payTo wallet MUST be claimed (Step 4) — deliverable work needs an
  accountable, reputation-bound counterparty. Unclaimed job submissions fail
  the \`claim\` gate.
- Job price cap: 50 USDC (the v1 no-arbitration limit), not the $5 call cap.
- One endpoint per job listing (the URL you submit).
- Never mix: an endpoint advertising \`extra.escrow\` is job-class — buyers'
  SDKs refuse to instant-pay it, and the re-probe suspends listings that
  switch class without resubmitting.

## Rules

- Price cap: 5 USDC per call per endpoint.
- Daily re-probe: your endpoint must keep answering a payable x402 402.
  3 consecutive failed days → suspended (auto-recovers when you're back).
- Changing your payTo wallet suspends the listing (identity change) —
  resubmit the URL to relist under the new wallet.
- Direct settlement: buyers pay you straight on-chain. There is no
  platform refund — deliver on every paid call; your on-chain sales history
  IS your reputation.
- Operator delist is reserved for abuse.

## Hand-rolling the protocol (any language)

Only if you cannot run Node. The contract your API must implement
(SUIMPP_X402_SCHEME v0.3 — sign-then-settle):

1. **402:** unpaid requests get status 402 with a JSON body carrying an x402
   \`accepts[]\` entry for \`sui:mainnet\` USDC: \`scheme: "exact"\`, your
   \`payTo\`, \`maxAmountRequired\` in atomic USDC (6 decimals: "20000" =
   0.02), plus \`extra.suimpp\` with a fresh \`challengeId\`, its FNV-1a-32
   \`nonce\`, the chain identifier (genesis digest) and the current
   \`[epoch, epoch+1]\` window.
2. **X-PAYMENT:** the retry carries base64 JSON with the buyer's
   \`senderAddress\`, signed gasless \`txBytes\` (BCS), \`senderSignature\`,
   and your \`challengeId\`. It is NOT a settled digest — YOU submit it.
3. **Verify structurally before touching the chain:** sender matches, gas
   price 0 + no gas payment (gasless), \`ValidDuring\` expiration whose nonce
   binds to your challengeId, only 0x2 framework send_funds/redeem_funds
   calls, recipient = your payTo.
4. **Validate the request body BEFORE settling** — invalid input answers 422
   and the payment is never submitted (buyers remember sellers who charge
   for errors; so does the re-probe).
5. **Run your handler, THEN settle:** submit \`txBytes\` + signature to Sui,
   confirm execution success and a USDC balance change to your payTo ≥ your
   price, record the digest AND the challengeId in a replay store (72h TTL —
   the payment stays chain-valid for the whole epoch window).
6. Serve the response with the settle receipt in \`X-PAYMENT-RESPONSE\`
   (base64 JSON: \`{ success, network, transaction, payer }\`).

TypeScript reference: \`@suimpp/mpp/x402\` exports every primitive above
(\`createX402Requirements\`, \`verifyX402Payment\`, \`settleX402Payment\`) —
@t2000/serve is the ~300-line composition of them; port that, not your own
design. The legacy MPP \`WWW-Authenticate\` header dialect alone is NOT
listable: it makes the seller verify personal-message signatures, which
browser (zkLogin) wallets fail AFTER the money moved.

Human docs: https://developers.t2000.ai/sell-to-agents/overview
Catalog JSON: https://mpp.t2000.ai/api/services
`;

export function GET() {
  return new Response(GUIDE, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'access-control-allow-origin': '*',
    },
  });
}
