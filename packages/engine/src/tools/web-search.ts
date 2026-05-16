import { z } from 'zod';
// [SPEC 37 v0.7a Phase 2 Batch A / 2026-05-16] Migrated from buildTool →
// defineTool. The hand-written `jsonSchema` field is gone — auto-generated
// from the Zod `inputSchema` so we have ONE source of truth. Behavior
// unchanged (same Tool shape returned, both engines consume identically).
// See packages/engine/src/v2/define-tool.ts for the migration template.
import { defineTool } from '../v2/define-tool.js';

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

export const webSearchTool = defineTool({
  name: 'web_search',
  description:
    'Search the web for real-time information. Use for news, token info, project details, protocol documentation, or any question that needs current web data. Free for users.',
  inputSchema,
  isReadOnly: true,
  maxResultSizeChars: 8_000,
  async call(input, context): Promise<{ data: WebSearchData; displayText: string }> {
    // [PR-B2] Hosts MUST pass `BRAVE_API_KEY` through `ToolContext.env`.
    // Direct `process.env` reads are banned in apps consuming the engine
    // (env-validation-gate.mdc) — the engine respects that contract by
    // routing every external secret through the typed context only.
    const apiKey = context.env?.BRAVE_API_KEY;
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
