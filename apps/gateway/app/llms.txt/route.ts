import { services } from '@/lib/services';

export function GET() {
  const lines: string[] = [
    '# t2000 MPP Gateway — Sui USDC',
    '',
    '> MPP-enabled APIs payable with Sui USDC. No API keys. No accounts. Just pay.',
    '> Docs: https://t2000.ai/docs',
    '> OpenAPI discovery: https://mpp.t2000.ai/openapi.json',
    '> Service catalog JSON: https://mpp.t2000.ai/api/services',
    '',
    '## Use with t2000',
    '',
    'Install the CLI and create an agent wallet:',
    '  $ npm i -g @t2000/cli && t2000 init',
    '',
    'Make a paid request:',
    '  $ t2000 pay https://mpp.t2000.ai/openai/v1/chat/completions \\',
    '      --data \'{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}\' \\',
    '      --max-price 0.05',
    '',
    'Or use the SDK:',
    "  import { T2000 } from '@t2000/sdk';",
    '  const agent = await T2000.create();',
    "  const result = await agent.pay({ url: '...', body: '...', maxPrice: 0.05 });",
    '',
    '## MCP (Claude Desktop, Cursor, Windsurf)',
    '',
    'If using t2000 via MCP, two tools handle MPP payments:',
    '',
    '- t2000_services — Discover all available services, endpoints, and prices. Call this first.',
    '- t2000_pay — Make a paid API request. Handles 402 payment challenges automatically.',
    '',
    'Natural language examples:',
    '  "Search the web for Sui blockchain news" → Brave Search ($0.005)',
    '  "Generate an image of a sunset" → Fal.ai Flux ($0.03)',
    '  "Translate this to Spanish" → DeepL ($0.005)',
    '  "Send a postcard to 123 Main St" → Lob ($1.00)',
    '  "What\'s the weather in Tokyo?" → OpenWeather ($0.005)',
    '  "Execute this Python code" → Judge0 ($0.005)',
    '  "Find flights from LAX to Tokyo" → SerpAPI Google Flights ($0.01)',
    '  "Convert 100 USD to EUR" → ExchangeRate ($0.005)',
    '  "Scan this URL for malware" → VirusTotal ($0.01)',
    '  "Shorten this link" → Short.io ($0.005)',
    '',
    '## Services',
    '',
  ];

  for (const svc of services) {
    lines.push(`### ${svc.name}`);
    lines.push(svc.description);
    lines.push(`Base URL: ${svc.serviceUrl}`);
    for (const ep of svc.endpoints) {
      lines.push(`- ${ep.method} ${ep.path} — ${ep.description} — $${ep.price}`);
    }
    lines.push('');
  }

  lines.push('## Payment');
  lines.push('');
  lines.push('All services accept Sui USDC via MPP (Machine Payments Protocol).');
  lines.push('Chain: Sui · Currency: USDC (Circle) · Settlement: ~400ms · Gas: <$0.001');

  return new Response(lines.join('\n'), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=60',
      'access-control-allow-origin': '*',
    },
  });
}
