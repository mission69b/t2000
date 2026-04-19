# t2000 Growth Plan — Distribution Checklist

> The product is built. The gap is visibility. Execute this list.

---

## Stage 1 — Get Listed (this week)

### MCP Directories

Every AI-forward developer browses these to find MCP servers. t2000 should be on all of them.

| Directory | Users/Servers | How to Submit | Status |
|-----------|--------------|---------------|--------|
| **mcp.so** | 18,600+ servers | Submit form at mcp.so/submit (Name, URL, config) | ⬜ |
| **glama.ai** | 19,400+ servers | Click "Add Server" on glama.ai/mcp/servers | ⬜ |
| **smithery.ai** | Major registry | Sign up at smithery.ai/new (GitHub login) | ⬜ |
| **pulsemcp.com** | Newsletter + directory | Submit to Official MCP Registry first (pulsemcp ingests weekly) | ⬜ |
| **Official MCP Registry** | Anthropic's registry | `mcp-publisher publish` — io.github.mission69b/t2000 v0.20.1 | ✅ |
| **mcpserver.so** | Growing directory | Submit via site | ⬜ |
| **awesome-mcp-servers** | 83K+ GitHub stars | PR opened: github.com/punkpeye/awesome-mcp-servers/pull/3366 | ✅ |

**Listing copy (reuse across all):**

```
t2000 — The infrastructure behind Audric

Financial infrastructure for AI agents on Sui.
Save, borrow, send, pay — via MCP, CLI, or SDK.

Non-custodial · USDC · Open source

Install: curl -fsSL https://t2000.ai/install | sh
GitHub: github.com/mission69b/t2000
Consumer app: audric.ai
```

**Category tags:** `finance`, `defi`, `crypto`, `banking`, `blockchain`, `sui`

### Submission instructions

**1. mcp.so** → https://mcp.so/submit
- Type: MCP Server
- Name: `t2000`
- URL: `https://github.com/mission69b/t2000`
- Server Config (paste):
```json
{
  "mcpServers": {
    "t2000": {
      "command": "npx",
      "args": ["-y", "@t2000/mcp"]
    }
  }
}
```

**2. glama.ai** → https://glama.ai/mcp/servers → click "Add Server"
- Paste repo URL: `https://github.com/mission69b/t2000`
- It auto-indexes from GitHub

**3. smithery.ai** → https://smithery.ai/new
- Sign in with GitHub
- Point to `https://github.com/mission69b/t2000`

**4. Official MCP Registry** → https://modelcontextprotocol.io/registry/quickstart
- Add `"mcpName": "io.github.mission69b/t2000"` to `packages/mcp/package.json`
- Publish to npm: `pnpm --filter @t2000/mcp publish`
- Install mcp-publisher: download from GitHub releases
- Run: `mcp-publisher login github` then `mcp-publisher publish`
- PulseMCP ingests from this registry weekly

**5. mcpserver.so** → https://mcpserver.so
- Submit via their site form

---

### GitHub Discoverability

| Action | Status |
|--------|--------|
| Add topics to repo: `mcp`, `mcp-server`, `defi`, `sui`, `ai-agent`, `crypto`, `banking`, `ai`, `typescript`, `blockchain` | ✅ |
| Set repo description + homepage URL | ✅ |
| Add GIF/video demo to README showing MCP in action | ⬜ |
| Submit to awesome-mcp-servers (PR #3366 opened) | ✅ |
| Submit to awesome-sui (PR #79 opened: github.com/sui-foundation/awesome-sui/pull/79) | ✅ |
| Submit to other awesome-* lists (awesome-defi, awesome-ai-agents) | ⬜ |

---

### Sui Ecosystem

| Action | How | Status |
|--------|-----|--------|
| Subscribe to Sui Grants RFP notifications | sui.io/grants-hub — RFP-based, watch for AI/DeFi RFPs | ⬜ |
| Check current open RFPs | sui.io/request-for-proposals → Airtable list | ⬜ |
| Submit to Sui Directory | sui.directory/submit-project — Primary: DeFi, Secondary: Developer Tools | ⬜ |
| Post in Sui Discord #showcase | Discord invite on sui.io | ⬜ |
| Reach out to Sui DevRel team | Tag on Twitter or DM | ⬜ |

---

## Stage 2 — Create Content (this week + ongoing)

> Twitter schedule and tweet copy → see `marketing/marketing-plan.md` (5 weeks of ready-to-post content)

### The Demo Video (most important single asset)

Record a 60-second screen capture showing:
1. `t2000 init` → wallet created
2. Open Claude Desktop → ask "what's my balance?"
3. Ask "save my idle USDC to the best rate"
4. Watch the transaction execute on-chain
5. Ask "how much am I earning?"

| Action | Status |
|--------|--------|
| Record 60s demo video | ⬜ |
| Post to Twitter/X | ⬜ |
| Post to YouTube Shorts | ⬜ |
| Add GIF/video to GitHub README | ⬜ |

This one video can drive more users than any feature.

### Reddit (one-time posts, space 2-3 days apart)

| Subreddit | Post Title | Status |
|-----------|-----------|--------|
| r/ClaudeAI | "MCP server for DeFi banking — save, borrow, pay from Claude Desktop" | ⬜ |
| r/artificial | "I built an MCP server that turns Claude into a financial advisor" | ⬜ |
| r/cryptocurrency | "An AI agent that automates savings, credit, and payments on Sui" | ⬜ |
| r/sui | "t2000 — bank account for AI agents, live on Sui mainnet" | ⬜ |
| r/LocalLLaMA | "MCP server for autonomous DeFi — 23 tools, works with any MCP client" | ⬜ |

---

## Stage 3 — Product Hunt Launch

### Prep Checklist

| Item | Status |
|------|--------|
| Hunter account created | ⬜ |
| 5+ upvotes lined up from network (day 1 momentum) | ⬜ |
| Tagline: "The infrastructure behind Audric" | ✅ |
| Description: 2-3 paragraphs on what it does + why it matters | ⬜ |
| Demo GIF/video (60s) | ⬜ |
| Screenshots: CLI, MCP in Claude Desktop, website | ⬜ |
| First comment ready (maker's story) | ⬜ |
| Launch day: Tuesday or Wednesday (highest traffic) | ⬜ |

### Maker's Story (first comment)

```
Hey PH! I'm [name], builder of t2000.

I got tired of manually juggling yield, borrowing, and health factors 
on-chain. So I built a bank account that AI agents can operate.

t2000 gives your AI (Claude, Cursor, any MCP client) tools to 
manage your money: save for yield, borrow, send, and pay for APIs.

Everything runs locally on your machine. Your keys never leave your 
device. Non-custodial, open source.

What makes it different: it's not a dashboard or a chatbot. It's 
infrastructure — an MCP server that any AI can plug into and operate 
autonomously.

Would love your feedback!
```

---

## Stage 4 — Partnerships & Community

| Action | Priority | Status |
|--------|----------|--------|
| Reach out to NAVI team — they already pinged about MCP | High | ⬜ |
| Get listed on Anthropic's MCP examples/showcase | High | ⬜ |
| Pitch to crypto/AI newsletters for coverage | Medium | ⬜ |
| Join MCP Discord community, be active | Medium | ⬜ |

---

## Metrics to Track

| Metric | Tool | Target (30 days) |
|--------|------|-----------------|
| npm installs (weekly) | npmjs.com/@t2000/cli | 100+ |
| GitHub stars | github.com/mission69b/t2000 | 200+ |
| MCP directory clicks | Each directory's analytics | Track |
| Twitter impressions | Twitter analytics | 50K+ |
| Unique agents (on-chain) | Indexer / stats API | 20+ |
| Website visits | Vercel analytics | 1K+ |

---

## Stage 5 — MPP Integration

> Stripe + Tempo launched the Machine Payments Protocol (MPP) — an open standard for agent payments.
> MPP supersedes x402. t2000 adopts it, not fights it. No Tempo Wallet needed — t2000 IS the wallet.
> No merchant registry needed — agents discover 402 at runtime, like browsers discover paywalls.
>
> **Positioning:** MPP is how agents pay. t2000 is where agents keep their money.
>
> **Full spec:** `spec/MPP_SPEC.md`

### Phase 1: `@t2000/mpp-sui` Package (days 1-3) ✅

Build the Sui payment method FIRST. The agent pays from existing Sui USDC — no new chain, no bridging.

| Task | Details | Status |
|------|---------|--------|
| `method.ts` — shared schema | `Method.from` with charge intent, Sui credential/request schemas | ✅ |
| `client.ts` — agent pays | `Method.toClient` — build USDC transfer TX, sign, broadcast, return credential | ✅ |
| `server.ts` — API accepts Sui USDC | `Method.toServer` — verify TX via Sui RPC, return receipt | ✅ |
| `utils.ts` — coin helpers | Fetch coins, merge fragmented USDC, constants | ✅ |
| Tests | Client + server integration tests (16 tests passing) | ✅ |
| Publish `@t2000/mpp-sui` | Standalone npm package — usable by anyone on Sui | ⬜ |

### Phase 2: SDK + CLI + MCP Integration (days 4-6) ✅

Wire `@t2000/mpp-sui` into the t2000 product.

| Task | Details | Status |
|------|---------|--------|
| SDK `agent.pay()` method | Wraps mppx + `@t2000/mpp-sui` + safeguards + history logging | ✅ |
| MCP `t2000_pay` tool | Claude/agents can pay for APIs conversationally | ✅ |
| CLI `t2000 pay` refactor | Replace x402 imports with `agent.pay()` | ✅ |
| Safeguards | Max per request, daily limit on API payments (use existing enforcer) | ✅ |
| Payment history | Log MPP payments in existing transaction history | ✅ |

**UX:**
```
# CLI
t2000 pay https://api.example.com/resource --data '{"prompt":"sunset"}'

# Claude Desktop
User: "Generate me a logo using Fal.ai"
Claude: [pays $0.03 automatically] "Here's your logo. Paid $0.03 from checking."
```

### Phase 3: x402 Deprecation + Docs (days 7-8) ✅

| Task | Details | Status |
|------|---------|--------|
| `npm deprecate @t2000/x402` | "Deprecated. Use @t2000/mpp-sui instead." | ✅ |
| Remove x402 from CLI/server deps | CLI uses `agent.pay()`, server uses mppx | ✅ |
| Update README, PRODUCT_FACTS, SECURITY docs | x402 → MPP throughout | ✅ |
| Update website (6 files) | "x402" → "MPP" in copy, stats, walkthrough | ✅ |
| Update skills (4 files) | x402 → MPP in skill descriptions | ✅ |
| Update CI/Dockerfiles (6 files) | Add mpp-sui build steps | ✅ |
| Update scripts (test-pay.ts, run-all.ts) | x402 → MPP, use `agent.pay()` | ✅ |

See `MPP_SPEC.md` for the complete file-by-file migration list.

### Phase 4: Landing Page + Launch (days 9-10)

| Task | Details | Status |
|------|---------|--------|
| Build t2000.ai/mpp page | Hero + server code snippet + agent UX demo | ✅ |
| Record demo video | 30s: Claude pays for API automatically via t2000 | ⬜ |
| Tweet announcement | "t2000 agents can now pay for any MPP service on Sui" | ⬜ |
| Submit to MPP ecosystem | PR to mpp.dev docs — list Sui as a payment method | ⬜ |

### Phase 5: Multi-chain (months 4-6, demand-driven)

Only build if MPP services on Tempo/Base gain real traction and users are asking.

| Trigger | Action |
|---------|--------|
| Users requesting Tempo/Base services | Add lightweight Tempo adapter (USDC payments only, no DeFi) |
| DeFi yields on Base exceed Sui | Research additional lending adapters |
| MPP ecosystem grows significantly | Dual-balance: Sui for DeFi, Base/Tempo for payments |

---

## What NOT to Build Right Now

- ❌ Merchant portal / service directory (no services accept Sui USDC via MPP yet)
- ❌ `t2000_services` discovery tool (no registry to query)
- ❌ Tempo Wallet integration (t2000 IS the wallet)
- ❌ Multi-chain DeFi (save/borrow stays on Sui)
- ❌ Tempo/Base chain adapters (no user demand yet)
- ❌ MPP session/streaming intents (start with charge, add later if demand)
- ❌ More lending adapters (2 is enough)
- ❌ Redundant dashboards (Audric IS the consumer dashboard)

---

## Decision Points

| If you see... | Then... |
|---------------|---------|
| 50+ weekly npm installs | Build dashboard (social proof) |
| Users asking for proactive agent | Build heartbeat/cron |
| MPP services growing on Tempo/Base | Add lightweight chain adapter for payments only |
| API devs adopting `@t2000/mpp-sui` | Build session/streaming intents |
| Protocol teams reaching out | Build their banking adapter |
| "How do I fund my wallet?" complaints | Build Moonpay on-ramp |
| Zero traction after 30 days | Reassess product-market fit |
