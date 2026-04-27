import { z } from 'zod';
import { buildTool } from '../tool.js';
import { fetchTokenPrices } from '../blockvision-prices.js';

// ---------------------------------------------------------------------------
// [v1.4 — Day 2] BlockVision-backed unified price tool.
//
// Replaces both deleted DefiLlama tools:
//   * `defillama_token_prices`  — multi-token spot price
//   * `defillama_price_change`  — single-token price + period change
//
// `defillama_price_change` previously supported 1h / 24h / 7d / 30d windows;
// BlockVision only exposes 24h. Surfacing 24h is enough to answer the hot-
// path question "did X move today?", and the LLM no longer has a tool that
// silently lies about 7d/30d windows by re-running 24h. Accepted regression.
//
// `protocol_deep_dive` (lone surviving DefiLlama prod dependency) is
// untouched — protocol-level safety data has no BlockVision equivalent.
// ---------------------------------------------------------------------------

export const tokenPricesTool = buildTool({
  name: 'token_prices',
  description:
    'Get current USD prices for Sui tokens, with optional 24h change. Accepts full coin type strings (e.g. "0x2::sui::SUI"). Returns price per token and (when requested) 24h change percentage. Use for "what is X worth?" or "did Y move today?". For balance + portfolio rendering, prefer balance_check / portfolio_analysis instead — they bundle the same prices into the standard cards.',
  inputSchema: z.object({
    coinTypes: z
      .array(z.string())
      .min(1)
      .max(10)
      .describe('Array of Sui coin type strings (max 10 per call).'),
    include24hChange: z
      .boolean()
      .optional()
      .describe('When true, include 24h change percentage per token in the output.'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      coinTypes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Sui coin type strings (max 10).',
      },
      include24hChange: {
        type: 'boolean',
        description: 'Include 24h change percentage per token.',
      },
    },
    required: ['coinTypes'],
  },
  isReadOnly: true,

  async call(input, context) {
    const prices = await fetchTokenPrices(input.coinTypes, context.blockvisionApiKey);

    const results = input.coinTypes.map((coinType) => {
      const entry = prices[coinType];
      const symbol = coinType.split('::').pop() ?? coinType;
      if (!entry) {
        return {
          coinType,
          symbol,
          price: null,
          priceUnavailable: true,
        };
      }
      const out: {
        coinType: string;
        symbol: string;
        price: number;
        change24h?: number;
      } = {
        coinType,
        symbol,
        price: entry.price,
      };
      if (input.include24hChange && entry.change24h !== undefined) {
        out.change24h = entry.change24h;
      }
      return out;
    });

    return {
      data: results,
      displayText: results
        .map((r) => {
          if (r.price === null) return `${r.symbol}: price unavailable`;
          const change = (r as { change24h?: number }).change24h;
          return change !== undefined
            ? `${r.symbol}: $${r.price.toFixed(4)} (${change >= 0 ? '+' : ''}${change.toFixed(2)}% 24h)`
            : `${r.symbol}: $${r.price.toFixed(4)}`;
        })
        .join(', '),
    };
  },
});
