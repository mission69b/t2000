import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createAgent } from './unlock.js';
import { registerReadTools } from './tools/read.js';
import { registerWriteTools } from './tools/write.js';
import { registerSafetyTools } from './tools/safety.js';
import { registerPrompts } from './prompts.js';
import { registerSkillPrompts } from './skills-prompts.js';

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
  const agent = await createAgent(opts?.keyPath);

  if (!agent.enforcer.isConfigured()) {
    console.error(
      'Safeguards not configured. Set limits before starting MCP:\n' +
      '  t2000 config set maxPerTx 100\n' +
      '  t2000 config set maxDailySend 500\n',
    );
    process.exit(1);
  }

  const server = new McpServer({ name: 't2000', version: PKG_VERSION });

  registerReadTools(server, agent);
  registerWriteTools(server, agent);
  registerSafetyTools(server, agent);
  registerPrompts(server);
  // SPEC v0.7a Phase 6 (6C) — auto-expose every t2000-skills SKILL.md as
  // an MCP prompt (`skill-<short-name>`). Baked into the bundle at build
  // time via tsup `define: { __BAKED_SKILLS__: ... }`. Companion to
  // `registerPrompts` (workflow prompts); 6G rewrites those to compose
  // against these skill bodies.
  registerSkillPrompts(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
