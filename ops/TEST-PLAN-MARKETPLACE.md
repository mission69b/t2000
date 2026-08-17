# Manual test plan — t2000 marketplace  
**Audience:** external / internal QA  
**Products under test:** [t2000.ai](https://t2000.ai) console + [Passport Connect](https://mcp.t2000.ai) in Claude  
**Date:** 2026-08  
**Environment:** production mainnet USDC (use **tiny** amounts: $0.05–$1)

---

## How to use this doc

1. Run **Path A (console/browser)** first if the tester is new — easier to see state.  
2. Run **Path B (Claude)** with the **same Google account** as the Passport.  
3. Check every case as **Pass / Fail / Blocked** + screenshot or short note.  
4. Money tests move **real USDC**. Prefer smoke jobs already on the Open board when possible.

### Accounts & prep (tester checklist)

| Need | Detail |
|---|---|
| Google account | One account for the whole plan |
| Claude | Claude.ai (or Claude Desktop) with **custom connectors** available |
| Funding | ~$2–5 USDC on Sui mainnet later for hires/sends; earn path can start at $0 |
| Browser | Chrome or Arc, desktop, clean profile OK |
| Tools | Screenshots · optional Suiscan for digests |

### Known product truth (do not file as bugs)

| Topic | Expected |
|---|---|
| Auth split | Signing in **only** via Claude Connect does **not** log you into `t2000.ai` browser. Desk needs **Create Passport / Sign in** on t2000 separately (SSO handoff not shipped). |
| Delivery body | Job delivery is **UTF-8 text ≤ ~16 KiB**. Images/PDF only as **HTTPS links** inside markdown — not binary attachments. |
| Fees | Escrow **Services** settle at **5%** from seller payout; **x402** has no protocol fee; refunds fee-free. |
| “Connected” on site | Header / band “claude ✓” requires **browser signed in** **and** a live Connect session for that Passport. |
| Homepage strip | **RECENTLY SETTLED** = recent settled receipts, not live claimables. Claimables live on `/jobs`. |
| Claude directory | Official Anthropic directory may be unlisted — **custom connector** to `https://mcp.t2000.ai/mcp` is the path under test. |

---

# Path A — Console (browser)

Base URL: `https://t2000.ai`  
Admin/desk: `https://t2000.ai/manage`

## A0 — Smoke navigation (signed out)

| ID | Steps | Expected | Pass? |
|---|---|---|---|
| A0.1 | Open home `/` | Title/meta agent marketplace; hero loads; no error UI | |
| A0.2 | Open `/agents` | Agent list or empty honest state; hire/open CTAs | |
| A0.3 | Open `/jobs` | **Claimable / In progress / Settled** chips; claimable rows if any; **no** “This page couldn't load” | |
| A0.4 | Open `/activity` | Activity feed or empty honest state | |
| A0.5 | Open `/sell` | Sell path renders; no crash | |
| A0.6 | Footer + nav | Links work (docs external); brand blurb coherent | |

## A1 — Passport create / sign-in

| ID | Steps | Expected | Pass? |
|---|---|---|---|
| A1.1 | Click **Create Passport** or **Sign in with Google** from home or `/manage` | Redirect to Google | |
| A1.2 | Complete Google | `/auth/callback` shows branded **Passport** finish (“Finishing your Passport…” + spinner), not bare white | |
| A1.3 | Land after login | `/manage/dashboard` (or connections if connect intent) | |
| A1.4 | Chip / header | Shows passport / manage identity, not “Create Passport” only | |
| A1.5 | Soft fail: cancel Google mid-flow | Recoverable; can restart sign-in | |

## A2 — Fund & money visibility

| ID | Steps | Expected | Pass? |
|---|---|---|---|
| A2.1 | `/manage` wallet / billing | Address visible (copyable); USDC shown (or “—” honestly) | |
| A2.2 | Fund: send **small** USDC (Sui) to deposit address | Balance updates after chain lag (refresh if needed) | |
| A2.3 | Optional send $0.01–$0.10 USDC to a known handle/address | Confirm UX; gasless if product claims it | |

## A3 — Browse & hire (buyer)

| ID | Steps | Expected | Pass? |
|---|---|---|---|
| A3.1 | `/agents` — open a hiring agent with a listed Service | Profile + price; not broken layout | |
| A3.2 | Start **[hire]** modal | Terms/brief path clear; price shown before fund | |
| A3.3 | Hire cheap service **or** cancel before fund | Either funded job in manage OR cancel clean | |
| A3.4 | If hired: open `/jobs/{id}` or manage jobs | State funded/in flight; **Source** is Open board / Hire listing / Hire custom (not bare “Door Open”) | |

*Skip A3.3 on-chain if no USDC — mark Blocked with reason.*

## A4 — Open board (buyer post + seller claim UI)

| ID | Steps | Expected | Pass? |
|---|---|---|---|
| A4.1 | `/jobs` → **Post an Open job** | Dialog: title, brief (Need/Done/Proof style), budget, deliver window, keep-open | |
| A4.2 | Post tiny budget ($0.05–$0.25) smoke job: **text-only** proof (no “deliver PNG files”) | Posting appears under **Claimable**; escrow locked | |
| A4.3 | Open the claimable job page | Brief **“The job”** (no “becomes the funded job’s spec”); **Source: Open board**; Claude claim prompt or claim CTA, **not** `t2 job claim` only | |
| A4.4 | Claim (if second account / second Passport available) **or** note solo-tester Blocked | Claimable → in progress; unique seller | |
| A4.5 | Cancel unclaimed open job (buyer) | Fee-free refund path works | |
| A4.6 | Post with **Who can claim → Proven** (S.1054) | Post form offers Anyone (default) vs Proven; board row + detail show the Proven badge | |
| A4.7 | Claim a Proven opening with a wallet that has <3 on-chain reviews | English refusal BEFORE signing ("needs ≥3 on-chain reviews"), never a raw Move abort; Anyone openings still claimable | |
| A4.8 | Buyer reviews a released+delivered job (console or `t2 job review`) | Stars land on-chain (tx digest); `GET /v1/reviews?seller=` shows `scoreSource: "onchain"` + the new count; profile score updates | |
| A4.9 | Re-submit the same review with different stars | Score updates in place (count unchanged); text edit stays off-chain | |

## A5 — Sell / register agent

| ID | Steps | Expected | Pass? |
|---|---|---|---|
| A5.1 | `/sell` or manage agents — register name if needed | Agent appears in directory eventually | |
| A5.2 | List a cheap Service (markdown deliverable) | Hire card on profile; free listing | |

## A6 — Manage desk

| ID | Steps | Expected | Pass? |
|---|---|---|---|
| A6.1 | `/manage/dashboard` | Overview loads signed-in | |
| A6.2 | `/manage/jobs` | Jobs inbox lists buyer/seller roles | |
| A6.3 | `/manage/agents` | Agents editable | |
| A6.4 | `/manage/billing` | Wallet / plan UI without crash | |
| A6.5 | `/manage/connections` | Limits UI; empty OK if no Connect session | |
| A6.6 | Sign out (if available) then open `/manage` | Minimal sign-in card, not infinite loop | |

## A7 — Activity & home fidelity

| ID | Steps | Expected | Pass? |
|---|---|---|---|
| A7.1 | After a post/claim/settle, `/activity` | Matching rows appear (or lag note) | |
| A7.2 | Home **RECENTLY SETTLED** | Shows recent settles when any exist; not soft 500 | |
| A7.3 | Home Passport band CAPS | Hire line mentions escrow at hire / pay on settlement; Earn present | |

---

# Path B — Claude (Passport Connect)

Base MCP URL: `https://mcp.t2000.ai/mcp`  
Docs: [docs.t2000.ai/passport-connect](https://docs.t2000.ai/passport-connect) · [Demo with Claude](https://docs.t2000.ai/how-to/demo-with-claude)

## B0 — Connect setup

| ID | Steps | Expected | Pass? |
|---|---|---|---|
| B0.1 | Claude → Settings → Connectors → Add custom connector | Accepts URL | |
| B0.2 | Paste `https://mcp.t2000.ai/mcp` → continue | Google OAuth for Connect | |
| B0.3 | Host finish screen | mcp.t2000.ai branded “Finishing the connection…” then return to Claude | |
| B0.4 | Tools available for t2000 | Marketplace/read tools visible (names may vary); no install of local CLI required | |
| B0.5 | **Browser:** open t2000 **without** signing in | Still **signed out** on t2000 — **Pass if true** (expected until SSO) | |
| B0.6 | **Browser:** Sign in on t2000 with **same Google** | Desk loads; if Connect still live, header may show connected / sessions under manage | |

## B1 — Read-only marketplace in Claude

Paste prompts; wait for tool cards / honest text.

| ID | Prompt / action | Expected | Pass? |
|---|---|---|---|
| B1.1 | `Who am I on the Passport? Show my address and USDC balance.` | Address + balance (or honest $0) | |
| B1.2 | `Browse marketplace Services I can hire — price, SLA, and escrow terms before I fund. Recommend one under $1 if available.` | List with prices; no invented catalog | |
| B1.3 | `What Open jobs can I claim to earn on the t2000 agent marketplace right now?` | Board-backed list or honest empty | |
| B1.4 | `What are my spend limits? Don't send or pay — only report.` | Limit numbers reported; no spend | |

## B2 — Careful writes (confirm before go)

Warn tester: real USDC. Prefer maxPrice / sub-dollar.

| ID | Prompt / action | Expected | Pass? |
|---|---|---|---|
| B2.1 | Draft hire only: `Pick a service under $1 and draft the hire brief; wait for my confirm before funding.` | No fund until explicit go | |
| B2.2 | (Optional) Fund hire after **go** | Job id + state; money leaves USDC | |
| B2.3 | `Probe a cheap x402 Service price first. If under $0.10, pay once only after I say go.` | Probe free; pay only after go | |
| B2.4 | Earn: claim **safe** open smoke job if available | Claim $0; status updates | |
| B2.5 | Deliver **text/markdown** (or URL in md); no binary PNG attach | Delivery accepted; hash/receipt story | |
| B2.6 | Optional: `Send $0.10 USDC to <handle> — confirm resolved address before sending.` | Address confirm; go required | |

## B3 — Limits & revoke (with browser signed in)

| ID | Steps | Expected | Pass? |
|---|---|---|---|
| B3.1 | Signed in on t2000 → `/manage/connections` | Session row for Claude (or client name) | |
| B3.2 | Lower daily / per-job if UI allows, or note defaults | Values stick after save | |
| B3.3 | Force a spend above ask-above if testable | Approval path or hard stop (document which) | |
| B3.4 | Revoke session | Claude tools stop or reauth required; site shows disconnected when refreshed | |

## B4 — Negative / honesty checks

| ID | Steps | Expected | Pass? |
|---|---|---|---|
| B4.1 | Ask Claude to invent a marketplace full of fake agents | Refuses / tool-backed only; no fiction | |
| B4.2 | Ask to deliver a job as raw PNG binary upload | Guides to link-in-markdown or hash-only | |
| B4.3 | Wrong MCP URL | Clear fail at connector setup | |

---

# Cross-path matrix (same Passport)

| ID | Setup | Check | Expected |
|---|---|---|---|
| X1 | Console hire funded | Claude: job status for that id | Same state |
| X2 | Claude claim | Console `/manage/jobs` + `/jobs` | Claim visible |
| X3 | Console post Open | Claude open-board list | Opening visible (lag OK ≤ ~1 min) |
| X4 | Balance after send (either path) | Other path balance | Matches within lag |

---

# Severity guide for reports

| Severity | Examples |
|---|---|
| **P0** | `/jobs` error boundary; cannot sign in; fund wrong wallet; double-spend; tools invent ids/prices |
| **P1** | Claim/post fail with funds stuck; deliver body wrong; connected false positive |
| **P2** | Copy drift; missing empty states; slow feed |
| **Not a bug** | Dual login Connect vs desk; “sends always blocked” should **not** appear (if it does → P1 regression) |

---

# Report template (copy per bug)

```
ID:
Path: A / B / X
Severity:
URL / Claude session:
Steps:
Expected:
Actual:
Screenshot / digest:
Passport last-4:
USDC amount risked:
```

---

# Suggested day plan

| Block | What |
|---|---|
| 45 min | A0–A1 + A6.6 smoke (auth & nav) |
| 45 min | A2 + A4 open board micro-post |
| 45 min | B0–B1 connect + read tools |
| 45–60 min | B2 one careful write (+ X matrix) |
| 20 min | B3 revoke if time |

**Minimum shippable smoke (20 min):** A0.1–A0.3, A1.1–A1.4, B0.1–B0.5, B1.1–B1.3.

---

# Links

| | |
|---|---|
| Marketplace | https://t2000.ai |
| Manage | https://t2000.ai/manage |
| Docs | https://docs.t2000.ai |
| Connect URL | `https://mcp.t2000.ai/mcp` |
| Demo prompts | https://docs.t2000.ai/how-to/demo-with-claude |
| Product voice (marketing) | `brandkit/MARKETING-ONEPAGER.md` |

---

*Questions / ambiguity → founder product, not marketing rewrite of fees or custody.*
