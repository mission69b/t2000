// Payment-asset constants for the x402 dialect. USDC is the settlement
// stable on both networks; anything richer (decimals lookups, symbol
// resolution) belongs to the SDK's token registry, not here.

export interface Currency {
  type: string;
  decimals: number;
}

export const SUI_USDC_TYPE =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

export const SUI_USDC_TESTNET_TYPE =
  '0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC';

export const USDC = {
  type: SUI_USDC_TYPE,
  decimals: 6,
} as const satisfies Currency;

export const USDC_TESTNET = {
  type: SUI_USDC_TESTNET_TYPE,
  decimals: 6,
} as const satisfies Currency;
