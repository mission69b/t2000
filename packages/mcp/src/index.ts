import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createAgent } from './unlock.js';
import { registerReadTools } from './tools/read.js';
import { registerWriteTools } from './tools/write.js';
import { registerSafetyTools } from './tools/safety.js';
import { registerPrompts } from './prompts.js';

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

  const server = new McpServer({ name: 't2000', version: '0.22.1' });

  registerReadTools(server, agent);
  registerWriteTools(server, agent);
  registerSafetyTools(server, agent);
  registerPrompts(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
