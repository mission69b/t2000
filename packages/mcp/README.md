# @t2000/mcp

MCP server for AI agent bank accounts on Sui. Connect Claude Desktop, Cursor, or any MCP client to your t2000 agent.

**16 tools · 3 prompts · stdio transport · safeguard enforced**

## Quick Start

```bash
# Install
npm i -g @t2000/cli

# Create wallet + configure safeguards
t2000 init
t2000 config set maxPerTx 100
t2000 config set maxDailySend 500

# Create session (saves PIN for MCP)
t2000 balance

# Start MCP server
t2000 mcp
```

## Platform Config

Paste into your AI platform's MCP settings:

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
