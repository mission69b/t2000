# @t2000/mcp

MCP server for AI agent bank accounts on Sui. Connect Claude Desktop, Cursor, or any MCP client to your t2000 agent.

**21 tools · 15 prompts · stdio transport · safeguard enforced**

## Quick Start

```bash
npm i -g @t2000/cli          # install
t2000 init                    # create wallet
t2000 config set maxPerTx 100 # set safeguards
t2000 mcp install             # auto-configure Claude Desktop + Cursor
```

Restart your AI platform, then ask: **"What's my t2000 balance?"**

To remove: `t2000 mcp uninstall`

For other platforms, paste manually:

```json
{ "mcpServers": { "t2000": { "command": "t2000", "args": ["mcp"] } } }
```

## Tools

| Tool | Type | Description |
|------|------|-------------|
| `t2000_balance` | read | Current balance |
| `t2000_address` | read | Wallet address |
| `t2000_positions` | read | Lending positions |
| `t2000_rates` | read | Interest rates |
| `t2000_health` | read | Health factor |
| `t2000_history` | read | Transaction history |
| `t2000_earnings` | read | Yield earnings |
| `t2000_send` | write | Send USDC |
| `t2000_save` | write | Deposit to savings |
| `t2000_withdraw` | write | Withdraw from savings |
| `t2000_borrow` | write | Borrow against collateral |
| `t2000_repay` | write | Repay debt |
| `t2000_exchange` | write | Swap assets |
| `t2000_rebalance` | write | Optimize yield |
| `t2000_invest` | write | Buy/sell investment assets; earn/unearn yield on SUI, ETH, BTC, GOLD |
| `t2000_contacts` | read | List saved contacts (name → address) |
| `t2000_portfolio` | read | Investment portfolio + P&L |
| `t2000_strategy` | write | Investment strategies — list, buy (PTB), sell, status, rebalance, create, delete |
| `t2000_auto_invest` | write | DCA scheduling — setup, status, run, stop |
| `t2000_config` | safety | View/set limits |
| `t2000_lock` | safety | Emergency freeze |

## Programmatic Usage

```typescript
import { startMcpServer } from '@t2000/mcp';

await startMcpServer({ keyPath: '/path/to/key' });
```

## Security

- Safeguard gate prevents starting without configured limits
- Per-transaction and daily send caps enforced on all state-changing tools
- `unlock` is CLI-only — AI cannot circumvent a locked agent
- `dryRun: true` previews operations without signing
- stdio transport — private key never leaves the machine

## License

MIT
