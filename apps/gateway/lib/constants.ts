import { env } from '@/lib/env';
export const SUI_USDC_TYPE =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

export const TREASURY_ADDRESS = env.TREASURY_ADDRESS ?? '0xb012ac774bee4ee6e4e571a13457eeb7a75c4f2319551bf9d436fd497d57aca1';

// [S.627] Treasury separation — both fall back to the legacy single treasury
// when the separated wallets aren't configured (rollback = unset envs).
//
// COLLECT_ADDRESS — where customer funds in flight land: commerce collects
// (gross held during delivery) + board escrow budgets. The gateway's hot
// spender (lib/refund.ts) MUST control this address.
export const COLLECT_ADDRESS = env.ESCROW_ADDRESS ?? TREASURY_ADDRESS;
// SERVICE_PAY_ADDRESS — where API service payments land (D1a: direct to
// revenue, cleaner books; service refunds come from the escrow float).
export const SERVICE_PAY_ADDRESS = env.REVENUE_ADDRESS ?? COLLECT_ADDRESS;
