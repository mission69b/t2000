import { z } from 'zod';
import { buildTool } from '../tool.js';

const BRAVE_API = 'https://api.search.brave.com/res/v1/web/search';

const inputSchema = z.object({
  query: z.string().describe('Search query'),
  count: z.number().optional().default(5).describe('Number of results (1-10)'),
});

interface SearchResult {
  title: string;
  url: string;
  description: string;
}

interface WebSearchData {
  results: SearchResult[];
  error?: string;
}

export const webSearchTool = buildTool({
  name: 'web_search',
  description:
    'Search the web for real-time information. Use for news, token info, project details, protocol documentation, or any question that needs current web data. Free for users.',
  inputSchema,
  jsonSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      count: { type: 'number', description: 'Number of results (1-10)', default: 5 },
    },
    required: ['query'],
  },
  isReadOnly: true,
  async call(input, context): Promise<{ data: WebSearchData; displayText: string }> {
    const apiKey = context.env?.BRAVE_API_KEY ?? process.env.BRAVE_API_KEY;
    if (!apiKey) {
      return {
        data: { results: [], error: 'Web search not configured' },
        displayText: 'Web search is not available.',
      };
    }

    const count = Math.min(Math.max(input.count ?? 5, 1), 10);
    const url = `${BRAVE_API}?q=${encodeURIComponent(input.query)}&count=${count}&text_decorations=false`;

    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      throw new Error(`Brave Search API error: HTTP ${res.status}`);
    }

    const json = await res.json() as {
      web?: { results?: Array<{ title: string; url: string; description: string }> };
    };

    const results: SearchResult[] = (json.web?.results ?? []).slice(0, count).map((r) => ({
      title: r.title,
      url: r.url,
      description: r.description,
    }));

    const displayText = results.length > 0
      ? results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.description}`).join('\n\n')
      : 'No results found.';

    return { data: { results }, displayText };
  },
});
