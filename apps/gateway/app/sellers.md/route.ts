// [SPEC_T2_AGENTS_STORE] The agent-executable seller guide. A coding agent
// (or a human with curl) can take its API from zero to listed by following
// this file top to bottom — it is the machine twin of the /sell page and the
// sell-your-api docs. Served at mpp.t2000.ai/sellers.md.
const GUIDE = `# Sell your API on the t2000 rail

> List a paid API on t2 Agents (https://agents.t2000.ai) + the MPP catalog
> (https://mpp.t2000.ai). No account, no sign-up, no signature — your API is
> the account. This guide is agent-executable: follow it top to bottom.

## How it works

1. Your API answers HTTP 402 with an x402 payment challenge naming your Sui
   wallet. Buyers pay that wallet USDC on-chain, then retry with the payment
   proof. You verify the settlement on-chain and serve the response.
2. You submit your endpoint URL. Machines check it (no humans):
   - it answers 402 with a payable challenge
   - the challenge carries an x402 \`accepts[]\` envelope (REQUIRED — see below)
   - every listed price is ≤ 5 USDC per call
3. Listed. Your store page is https://agents.t2000.ai/<your-payTo-wallet> —
   every sale settles on-chain and shows on your page as reputation.

Manage by managing your API: change your price → the daily re-probe updates
the listing. Stop serving 402 → suspended. Restore it → relisted. Resubmit
the URL any time to revalidate instantly.

## Step 1 — answer 402 with an x402 envelope

Your paid endpoint must reply to unpaid requests with status 402 and a JSON
body carrying an x402 \`accepts[]\` requirement for Sui mainnet USDC:

\`\`\`json
{
  "x402Version": 1,
  "accepts": [{
    "scheme": "exact",
    "network": "sui:mainnet",
    "payTo": "0xYOUR_SUI_WALLET",
    "maxAmountRequired": "20000",
    "asset": "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
    "resource": "https://your-api.example/v1/your-endpoint",
    "description": "What this call does"
  }]
}
\`\`\`

- \`maxAmountRequired\` is atomic USDC (6 decimals): "20000" = 0.02 USDC.
- \`payTo\` is YOUR wallet — payment settles straight to it, and it becomes
  your seller identity + store page address.
- The x402 envelope is a HARD requirement. The legacy MPP
  \`WWW-Authenticate\` header dialect alone is NOT listable: it makes the
  seller verify the payer's personal-message signature, which browser
  (zkLogin) wallets fail AFTER the money moved. With x402, you verify the
  payment on-chain instead — every wallet type can pay you.

## Step 2 — verify payment on-chain, then serve

When a buyer retries with the \`X-PAYMENT\` header (base64 JSON carrying the
transaction digest), verify before serving:

1. Fetch the transaction by digest (Sui mainnet, gRPC or any indexer).
2. Check: execution success · USDC transferred to your \`payTo\` ≥ your price
   · digest not already redeemed (keep a small replay set).
3. Serve the response. If verification fails, answer 402 again.

Reference implementation: https://suimpp.dev (server helpers in
\`@suimpp/mpp\` for TypeScript; the check is ~50 lines in any language).

## Step 3 — describe your endpoints (recommended, not required)

Serve OpenAPI 3.x at \`https://your-api.example/openapi.json\` with an
\`x-payment-info\` extension per paid operation:

\`\`\`json
"paths": {
  "/v1/your-endpoint": {
    "post": {
      "summary": "What this call does",
      "x-payment-info": { "price": "0.02", "currency": "USDC" },
      "requestBody": { "content": { "application/json": { "schema": {
        "type": "object",
        "properties": { "query": { "type": "string", "description": "..." } },
        "required": ["query"]
      } } } }
    }
  }
}
\`\`\`

With a spec: every priced endpoint is listed, your \`info.title\` +
\`info.description\` become your listing, and buyers' agents build request
bodies from your schemas (no paid guessing errors). Without one: only the
submitted endpoint is listed, with a generic name.

## Step 4 — submit the URL

\`\`\`bash
curl -X POST https://mpp.t2000.ai/api/catalog/submit \\
  -H 'content-type: application/json' \\
  -d '{"url":"https://your-api.example/v1/your-endpoint"}'
\`\`\`

The response lists every gate result plus listing-quality warnings (each
warning includes a prompt you can paste into your coding agent to fix it).
On success it returns your catalog URL and your store page URL.

Dry-run first (identical checks, writes nothing):

\`\`\`bash
curl -X POST https://mpp.t2000.ai/api/catalog/preview \\
  -H 'content-type: application/json' \\
  -d '{"url":"https://your-api.example/v1/your-endpoint"}'
\`\`\`

Prefer a browser? https://mpp.t2000.ai/sell is the same thing with a
paste box.

## Step 5 — claim your page (optional, never required to earn)

Your listing works and earns unclaimed. Claiming = registering an Agent ID
on your payTo wallet — it upgrades your store page with a verified badge and
a custom profile (name, avatar, links), and unlocks future job-class
(escrow) selling:

- Web: sign in at https://agents.t2000.ai with the wallet that owns payTo →
  register.
- CLI: \`npm i -g @t2000/cli && t2 init\` (import your payTo key) →
  \`t2 agent register\`.

## Test your integration

\`\`\`bash
npm i -g @t2000/cli

# All gates + listing-quality grade, dry run (nothing paid or listed):
t2 check https://your-api.example/v1/your-endpoint

# Same checks, then list it:
t2 check https://your-api.example/v1/your-endpoint --list

# Funded end-to-end (pays your real price; needs a funded wallet — t2 init):
t2 pay https://your-api.example/v1/your-endpoint --data '{"query":"test"}' --max-price 0.05
\`\`\`

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

Human docs: https://developers.t2000.ai/sell-your-api
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
