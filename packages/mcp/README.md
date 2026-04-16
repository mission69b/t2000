# @t2000/mcp

MCP server for AI agent bank accounts on Sui. Connect Claude Desktop, Cursor, or any MCP client to your t2000 agent.

**Safeguard enforced · stdio transport**

> **New to t2000?** Run `t2000 init` — it creates your wallet, configures MCP for your AI platforms, and sets safeguards in one command.

## Quick Start

```bash
npm i -g @t2000/cli   # install
t2000 init             # wallet + MCP + safeguards
```

Restart your AI platform, then ask: **"What's my t2000 balance?"**

> `t2000 mcp install` can reconfigure MCP platforms later if needed.

To remove: `t2000 mcp uninstall`

For other platforms, paste manually:

```json
{ "mcpServers": { "t2000": { "command": "t2000", "args": ["mcp"] } } }
```

## Tools

| Tool | Type | Description |
|------|------|-------------|
| `t2000_overview` | read | Complete account snapshot in one call |
| `t2000_balance` | read | Current balance |
| `t2000_address` | read | Wallet address |
| `t2000_positions` | read | Lending positions |
| `t2000_rates` | read | Best interest rates per asset |
| `t2000_all_rates` | read | Per-protocol rate comparison |
| `t2000_health` | read | Health factor |
| `t2000_history` | read | Transaction history |
| `t2000_earnings` | read | Yield earnings |
| `t2000_fund_status` | read | Savings fund status |
| `t2000_pending_rewards` | read | Pending protocol rewards |
| `t2000_deposit_info` | read | Deposit instructions |
| `t2000_receive` | read | Generate payment request with address, nonce, and Payment Kit URI (`sui:pay?…`) |
| `t2000_contacts` | read | List saved contacts (name → address) |
| `t2000_services` | read | Discover MPP services, endpoints, and prices |
| `t2000_pay` | write | Make a paid API request via MPP |
| `t2000_send` | write | Send USDC |
| `t2000_save` | write | Deposit to savings |
| `t2000_withdraw` | write | Withdraw from savings |
| `t2000_borrow` | write | Borrow against collateral |
| `t2000_repay` | write | Repay debt |
| `t2000_claim_rewards` | write | Claim pending protocol rewards |
| `t2000_contact_add` | write | Save a contact name → address |
| `t2000_contact_remove` | write | Remove a saved contact |
| `t2000_swap` | write | Execute a token swap via Cetus Aggregator |
| `t2000_stake` | write | Stake SUI for vSUI via VOLO liquid staking |
| `t2000_unstake` | write | Unstake vSUI and redeem SUI |
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
