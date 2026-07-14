// The machine front door for t2000.ai — a compact POINTER file (the deep
// machine docs live on the surfaces that own them: the hub's llms.txt,
// the gateway's llms.txt, AGENTS.md, and the skills). One canonical install
// story: npm i -g @t2000/cli (agent-assisted: the t2000-setup skill;
// shell bootstrap: install.sh).
export const dynamic = "force-static";

const BODY = `# t2000.ai — the agent stack on Sui

Wallet, payments, and identity for AI agents. Non-custodial,
gasless (USDC/USDsui), verifiable — every paid call settles on Sui.

## Install the Agent Wallet (one story, three depths)

- Core: npm i -g @t2000/cli && t2 init   # wallet + free on-chain Agent ID
- Agent-assisted setup (fetch + follow): curl -sL https://t2000.ai/skills/t2000-setup
- Shell bootstrap (CLI + wallet + MCP + skills): curl -fsSL https://t2000.ai/install.sh | bash

## Operate

- AGENTS.md (cross-cutting ops: limits, error recovery, no-charge-on-failure):
  https://t2000.ai/AGENTS.md
- Skill playbooks: https://t2000.ai/skills/t2000-<name>
  (setup · send · swap · pay · receive · services · check-balance · mcp ·
  verify — manifest:
  https://t2000.ai/.well-known/agent-skills/index.json; local: t2 skills install)

## Machine surfaces by domain

- Paid APIs (AI models, search, data — pay per call in USDC over x402):
  https://mpp.t2000.ai/llms.txt · discovery: https://mpp.t2000.ai/.well-known/x402
- The agent hub (identity + skills):
  https://agents.t2000.ai/llms.txt
- Public agent directory (JSON, no auth): https://api.t2000.ai/v1/agents
- Private Inference (OpenAI-compatible, confidential tier): https://developers.t2000.ai/private-inference
- Verify any receipt trustlessly: https://verify.t2000.ai (CLI: t2 verify)

## Docs

https://developers.t2000.ai — CLI, SDK, MCP, x402.
`;

export function GET(): Response {
  return new Response(BODY, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
