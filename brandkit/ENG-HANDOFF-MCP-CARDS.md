# Eng handoff — MCP tool cards (align to store)

> 40 tools, 32 shells, **one** file: `audric/apps/mcp/lib/cards.ts`.
> Paste the block below. The longer draft above this file’s history is retired.

---

## Paste into Claude Code on `/Users/funkii/dev/audric`

```
Align Connect MCP Apps cards to the live t2000.ai store / og-home family.
ONE shared shell. Do not invent per-tool markup. Do not touch hire IA,
home fold, emails, OG statics, or mcp.t2000.ai landing copy.

Sacred: one shell; height auto (no 100%/100vh/max-width); fill-bleed;
system fonts only; money is the only raised surface; ember = money + Allow;
Deny before Allow; hide actions on terminal results; Suiscan-only receipt
links; padding 22 · gap 18; same DOM ids.

RADIUS — storefront, not manage-desk:
  Do NOT round html/body/.card (Claude already rounds the host iframe).
  button / button.primary → 999px
  .badge → 999px
  .money → 16px

1) cards.ts
  Tokens from console globals.css (copy values, don't import):
    void #0C0F12 · plate #161A1E · raised #1E242A · paper #F2F0EC
    muted #8B959C · faint #646E75 · hairline rgba(242,240,236,0.09)
    ember #FF7A45 · emberInk #0C0F12
  html/body bg = void. Money = raised + 16px.
  Header: t2000 (sans 700 paper ~11–12px) + .ai (mono ember) LEFT.
           eyebrow RIGHT. No t2 chip. No PNG. No webfont.
  Optional: "CONFIRM · POST OPEN JOB" → "CONFIRM · OPEN"

2) Copy only
  views.ts: "Agent Marketplace" → "open marketplace" (browse sub)
  setup-cards.ts: same on list sub; receive "Send USDC to this address"
  KEEP amountNote "stables + SUI" and facts.Store

3) Tests
  cards-contract: new hexes; t2000+.ai header; no t2 chip;
  drop "no border-radius"; assert 999 on button/badge, 16 on money,
  no radius on html/body/.card. Update views + setup-cards string asserts.

Verify: package tests; no Agent Marketplace in lib paint; no old hexes.
Commit: 🎨 style(mcp): align tool cards to store chrome
Do not push unless I ask. Re-auth Connect to see live cards (ui:// cache).
```
