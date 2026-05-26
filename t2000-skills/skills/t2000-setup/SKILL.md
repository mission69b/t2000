---
name: t2000-setup
description: >-
  Set up a t2000 Agentic Wallet end-to-end on the user's machine. Use when
  the user says "set up t2000", "install the wallet", "create my Agentic
  Wallet", "connect t2000 to Claude / Cursor", or pastes a one-prompt
  install URL. Covers wallet creation, PIN, safeguards, and MCP wiring.
  Read this first when bootstrapping a new user; the other skills assume
  this has run.
license: MIT
metadata:
  author: t2000
  version: "1.0"
  requires: Node.js 18+ and a terminal
---

# t2000: Agentic Wallet — One-Prompt Setup

## Purpose

Get a fresh user from "nothing installed" to "Agentic Wallet ready" in under 5 minutes. This is the canonical entry point for the **one-prompt install** UX:

```
Run curl -sL https://t2000.ai/skills/t2000-setup, and use the returned setup
instructions to set up my Agentic Wallet.
```

When invoked through that prompt, the LLM fetches this file, then executes the steps below in order.

## Rules

1. **Walk the steps in order.** Each step depends on the previous one. Skipping breaks setup.
2. **Surface, don't store, the PIN.** Tell the user to write it down. Never echo or persist their PIN in agent memory.
3. **Stop at the first failure.** If `t2000 init` errors, do not proceed to step 3; report the error and ask the user to retry.
4. **Confirm AI-client choice before MCP install.** Don't assume Claude Desktop vs. Cursor vs. Windsurf — ask which they use, then pick the matching config path.
5. **Setup is read + write — show, then ask.** Echo each command you're about to run. The user runs it (or confirms you can). Never silently shell out.

## Steps

### Step 1 — Install the CLI

```bash
npm install -g @t2000/cli
```

Verify:
```bash
t2000 --version
# Should print: 3.x.x (beta)
```

If `npm` is missing, point the user to https://nodejs.org/ (Node 18+).

### Step 2 — Create a wallet

```bash
t2000 init
```

This is interactive:
- Prompts for a PIN — the user types it; **you do not handle this**.
- Generates a fresh Ed25519 keypair on Sui mainnet.
- Prints the wallet address.

After init completes, ask the user to record the PIN somewhere safe (it encrypts the local key file at `~/.t2000/wallet.key`).

### Step 3 — Fund the wallet

```bash
t2000 fund
```

Shows the deposit address + supported networks. Tell the user:
- Send USDC to the printed address on **Sui mainnet** (not Solana, not Ethereum).
- Keep ~0.05 SUI on hand for gas (or let `t2000 swap` top it up later).
- 1 USDC minimum to get going.

### Step 4 — Configure safeguards (required for MCP)

```bash
t2000 config set maxPerTx 100
t2000 config set maxDailySend 500
```

The MCP server **refuses to start** without these. Defaults are conservative ($100 per transaction, $500 per day); the user can raise them later via `t2000 config set`.

### Step 5 — Install MCP into the user's AI client

Ask the user which AI client they use, then run:

```bash
t2000 mcp install
```

This is interactive — it discovers installed clients (Claude Desktop, Cursor, Windsurf, Cline, Continue) and offers a multi-select. The CLI writes the correct config block into each chosen client.

After install, the user must **restart the AI client** for it to pick up the new MCP server.

### Step 6 — Verify

**6a — CLI smoke** (in the same terminal):
```bash
t2000 balance
```

Should print:
- Wallet address (last 6 chars match step 2)
- Available USDC (matches step 3 funding, or $0.00 if not yet funded)
- Gas reserve (SUI)
- Total

**6b — AI client tool smoke** (after restart):
```
What's my t2000 balance?
```

Should invoke the `t2000_balance` MCP tool and return the same numbers.

**6c — AI client prompt smoke** (this is what most users miss):

The MCP server doesn't just expose tools — it ALSO exposes 35 prompts. Type `/` in the AI client's chat input to open the prompt picker. You should see:

- 17 core wallet `skill-` entries (`skill-balance`, `skill-save`, `skill-borrow`, etc.) — canonical t2000 skills as MCP prompts.
- 4 MPP recipe `skill-mpp-*` entries (`skill-mpp-image-gen`, `skill-mpp-gpt4o`, `skill-mpp-transcription`, `skill-mpp-index`) — deep dives for paying paid APIs via `t2000 pay`.
- 14 workflow prompts (`financial-report`, `optimize-yield`, `sweep`, `risk-check`, etc.) — multi-skill orchestrations.

Run `/skill-balance` (or just type and accept the autocomplete). The skill markdown loads as a prompt and the assistant returns a structured balance breakdown. Try `/financial-report` for the full-account view. Try `/skill-mpp-image-gen` to see how to generate an image via `t2000 pay`.

**Why this matters:** users often paste the one-prompt-install command above, see the t2000 tools work, but don't realize they also have 21 skill prompts + 14 workflow prompts available. Surface this so they discover the agentic surface, not just the tool calls.

## What "ready" looks like

After setup the user has:
- A non-custodial Sui wallet at `~/.t2000/wallet.key` (encrypted with their PIN).
- Optional USDC + SUI funded on Sui mainnet.
- Configured per-tx + daily safeguards.
- An MCP server wired into Claude / Cursor / Windsurf etc. — Audric-style chat that can actually move money under user confirmation.

## What setup does NOT do

- **Does not move money.** Setup is read + config only. The first money-moving operation is whatever the user asks the AI to do next.
- **Does not export or back up the private key.** The key lives in `~/.t2000/wallet.key` and is encrypted by the PIN. To back up, the user runs `t2000 export` manually — never volunteer this unless asked.
- **Does not bypass safeguards.** Even with MCP installed, every write tap-to-confirms through the AI client; safeguards apply server-side.

## Next steps to suggest

After verify succeeds, surface a short menu of natural next moves:
- "Earn yield on your USDC" → `t2000-save`
- "Send USDC to someone" → `t2000-send`
- "Connect more AI clients" → `t2000-mcp`
- "See what else t2000 can do" → run `t2000 --help` or browse https://t2000.ai/skills

## Troubleshooting

| Symptom | Fix |
|---|---|
| `t2000: command not found` after npm install | `npm bin -g` directory not on PATH; add it or use `npx @t2000/cli ...` instead |
| `t2000 init` fails with permission error | Don't run with `sudo`; npm global may need a user-level prefix (`npm config set prefix ~/.npm-global`) |
| MCP server "doesn't do anything" when run manually | Working as designed — the server is a subprocess launched by the AI client, never run from a terminal. See `t2000-mcp` skill. |
| AI client doesn't see `t2000_*` tools after install | Restart the client. If still missing, check the per-client config path printed by `t2000 mcp install`. |
