import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createAgent } from './unlock.js';
import { registerReadTools } from './tools/read.js';
import { registerWriteTools } from './tools/write.js';
import { registerSafetyTools } from './tools/safety.js';
import { registerPrompts } from './prompts.js';

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

  const server = new McpServer({ name: 't2000', version: '0.13.0' });

  registerReadTools(server, agent);
  registerWriteTools(server, agent);
  registerSafetyTools(server, agent);
  registerPrompts(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
