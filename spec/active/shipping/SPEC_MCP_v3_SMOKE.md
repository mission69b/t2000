# SPEC_MCP_v3_SMOKE — `@t2000/mcp@3.1.0` Smoke Checklist

> **Status:** ACTIVE · drafted 2026-05-25 · target: any developer with Claude Desktop or Cursor installed · est. 5-7 min
> **Build smoked:** `@t2000/mcp@3.1.0`
> **Pre-req:** A working CLI install (run `SPEC_CLI_v3_SMOKE.md` first if you haven't) · Claude Desktop OR Cursor with MCP support

---

## Why this exists

MCP v3.0.0 / v3.1.0 added an ESLint config and pulled the engine version bump downstream. The MCP server is what AI clients (Claude Desktop / Cursor / Windsurf) connect to via stdio — if the server crashes on startup or refuses to expose tools, every AI client using t2000 is broken.

This is an **MCP-protocol canary** — install via `t2000 mcp install`, connect from a real AI client, run the most important read + write tool, confirm the wire protocol works end-to-end.

---

## Setup (1 min)

```bash
# If CLI smoke just ran with a sandbox key, you can keep that wallet for MCP.
# Otherwise, ensure ~/.t2000/wallet.key exists from a real `t2000 init`.
t2000 mcp install --claude-desktop
# (or `--cursor` for Cursor — pick the AI client you'll test from)

# Restart Claude Desktop / Cursor.
```

---

## MCP-SMOKE-1 — Server starts + tools registered (1 min)

In your AI client, open a new chat and type:

> What MCP tools do you have available from t2000?

### Verifiable signals

- ✅ Client lists at least: `t2000_overview`, `t2000_balance`, `t2000_address`, `t2000_send`, `t2000_save`, `t2000_swap`, `t2000_history`, `t2000_rates`.
- ✅ No "MCP server failed to start" error in the client's connection logs.
- ✅ Tool count ≥ 20 (the full surface is ~25 — exact number per `packages/mcp/src/index.ts` `MCP_TOOLS` array).

If the client doesn't list any t2000 tools, troubleshoot: `t2000 mcp test` from the terminal — it executes the same command the AI client would and prints the tool registration handshake.

---

## MCP-SMOKE-2 — `t2000_overview` read tool (1 min)

In the AI chat:

> Show me my t2000 overview.

### Verifiable signals

- ✅ AI client invokes the `t2000_overview` tool (visible in tool-call expansion / disclosure).
- ✅ Returns a JSON object with `address`, `balance`, `savings`, `health`, `rates` (or similar canonical fields).
- ✅ Numbers reflect the wallet's actual state (e.g., the $1 you saved in CLI-SMOKE-4 should show in `savings`).

---

## MCP-SMOKE-3 — `t2000_rates` read tool (1 min)

> What are the current NAVI rates?

### Verifiable signals

- ✅ AI client invokes `t2000_rates`.
- ✅ Returns rates for `USDC`, `USDsui`, `SUI` at minimum.
- ✅ AI client narrates the rates naturally (not just dumping the raw JSON).

---

## MCP-SMOKE-4 — `t2000_send` write tool with safeguard (2 min)

> Send 0.5 USDC to myself.

### Verifiable signals

- ✅ AI client invokes `t2000_send` (this is a `confirm`-tier write).
- ✅ The CLI safeguard fires — if a per-tx limit or daily limit is set, the tool refuses (✅ this is the safeguard working).
- ✅ If no safeguard set, the send proceeds and the client narrates the receipt with a Suiscan link.

---

## MCP-SMOKE-5 — Tool surface contains no deleted tools (1 min)

Verify the published 3.1.0 MCP doesn't re-expose tools that were removed engine-side. Ask:

> Do you have any of these tools: `pay_api`, `volo_stats`, `mpp_services`, `web_search`, `protocol_deep_dive`, `create_invoice`?

### Verifiable signal

- ✅ AI client confirms NONE of those are in its tool registry. (MCP retains `t2000_stake` / `t2000_unstake` / `t2000_pay` — these are NON-Audric SDK consumers' surface — but they map to SDK methods, not the deleted engine tools.)

---

## Wrap-up

If all 5 items pass, MCP 3.1.0 is shippable + wire-compatible with Claude Desktop + Cursor. Cleanup:

```bash
t2000 mcp uninstall --claude-desktop
# (or --cursor)
```

Move this file to `spec/archive/<version>/SPEC_MCP_v3_SMOKE.md` after the founder confirms PASSED.
