import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createAgent } from './agent.js';
import { registerReadTools } from './tools/read.js';
import { registerWriteTools } from './tools/write.js';
import { registerLimitTool } from './tools/limit.js';
import { registerSkillPrompts } from './skills-prompts.js';
import { T2000_SERVER_INSTRUCTIONS } from './instructions.js';

// Replaced at build time by tsup's `define` with the package.json version
// string. Falls back to a sentinel during dev/typecheck runs that don't
// go through the bundler.
declare const __MCP_PKG_VERSION__: string;
const PKG_VERSION =
  typeof __MCP_PKG_VERSION__ === 'string' ? __MCP_PKG_VERSION__ : '0.0.0-dev';

// Redirect console.log/warn to stderr so dependency debug output
// (e.g. NAVI SDK's "[getWorkingPythEndpoint]") doesn't pollute the
// stdio JSON-RPC channel that MCP uses for communication.
console.log = (...args: unknown[]) => console.error('[log]', ...args);
console.warn = (...args: unknown[]) => console.error('[warn]', ...args);

export async function startMcpServer(opts?: { keyPath?: string }): Promise<void> {
  // [v4.0 Phase B] Pre-v4 the server gated startup on
  // `agent.enforcer.isConfigured()` and printed a hint to set
  // `maxPerTx` + `maxDailySend` via the (now deleted) `t2000 config`
  // command. v4 ships with no default limits — the warning footer
  // surfaces during `t2 init`, not at MCP server boot. Opt-in via
  // `t2 limit set --daily 100` or `t2 limit set --per-tx 50`.
  const agent = await createAgent(opts?.keyPath);

  // The `instructions` field is surfaced by MCP clients (Claude Desktop,
  // Cursor) at conversation start — it primes the model to route paid
  // third-party API requests (fal.ai, ElevenLabs, …) through MPP instead
  // of declining them in a cold session. See `instructions.ts`.
  const server = new McpServer(
    { name: 't2000', version: PKG_VERSION },
    { instructions: T2000_SERVER_INSTRUCTIONS },
  );

  registerReadTools(server, agent);
  await registerWriteTools(server, agent);
  registerLimitTool(server);

  // SPEC v0.7a Phase 6 (6C) — auto-expose every t2000-skills SKILL.md
  // as an MCP prompt (`skill-<short-name>`). Baked into the bundle at
  // build time via tsup `define: { __BAKED_SKILLS__: ... }`. The
  // hand-rolled `registerPrompts` workflow prompts were removed in
  // Phase B of SPEC_AGENT_WALLET_GREENFIELD (S.336) — they composed
  // against the v3 DeFi skill set, all of which were deleted Day 5.
  registerSkillPrompts(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
