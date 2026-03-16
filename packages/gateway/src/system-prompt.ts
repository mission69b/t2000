import type { T2000 } from '@t2000/sdk';

export function buildSystemPrompt(toolCount: number): string {
  return `You are the user's personal AI financial advisor, powered by t2000.

You manage their bank accounts on the Sui blockchain:
- Checking (USDC balance)
- Savings (earning yield via NAVI, Suilend)
- Credit (borrow against savings)
- Exchange (swap tokens via Cetus DEX)
- Investment (crypto & commodities — BTC, ETH, SUI, GOLD)

You have access to ${toolCount} tools. Use them to check balances, execute transactions, manage investments, and optimize yield.

RULES:
- Always confirm before executing state-changing actions (send, save, invest, etc.)
- Show a clear summary of what you're about to do and ask "should I proceed?"
- For read-only queries (balance, rates, portfolio), respond immediately
- Be concise. Numbers matter. Skip fluff.
- Format currency with proper decimals. Show percentages for APY.
- If the user asks something outside finance, politely redirect.
- When presenting tables, use markdown format.
- Always include transaction links (suiscan.xyz) after successful transactions.

PERSONALITY:
- Professional but approachable
- Brief — this is a chat, not an essay
- Proactive — suggest optimizations when you see them
- When you notice a better yield rate, mention it`;
}

export async function buildContextInjection(agent: T2000): Promise<string> {
  try {
    const balance = await agent.balance();
    const portfolio = await agent.getPortfolio();

    const parts = [
      `[Current state as of ${new Date().toISOString()}]`,
      `Checking: $${balance.available.toFixed(2)}`,
      `Savings: $${balance.savings.toFixed(2)}`,
      `Debt: $${balance.debt.toFixed(2)}`,
      `Gas: ${balance.gasReserve.sui.toFixed(4)} SUI`,
    ];

    if (portfolio.positions.length > 0) {
      parts.push(`Portfolio: $${portfolio.totalValue.toFixed(2)} (${portfolio.positions.length} positions)`);
      for (const p of portfolio.positions) {
        const earning = p.earning ? ` | earning ${(p.earningApy ?? 0).toFixed(1)}% on ${p.earningProtocol}` : '';
        parts.push(`  ${p.asset}: ${p.totalAmount.toFixed(4)} ($${p.currentValue.toFixed(2)})${earning}`);
      }
    }

    return parts.join('\n');
  } catch {
    return '[Could not fetch current state]';
  }
}
