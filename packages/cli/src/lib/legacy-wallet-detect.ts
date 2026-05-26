// [SPEC_AGENT_WALLET_GREENFIELD Phase A Day 1 — 2026-05-26]
// Detect v3.x AES wallets before any agent operation and print a
// recovery banner. No auto-migration: small affected user base + manual
// `t2 init --import` flow is acceptable per the locked decision.

import { isLegacyWalletPath } from '@t2000/sdk';

export async function checkForLegacyWallet(keyPath?: string): Promise<boolean> {
  return isLegacyWalletPath(keyPath);
}

export function formatLegacyWalletBanner(filePath: string): string {
  return [
    '',
    `  ✗ Legacy v3.x AES wallet detected at ${filePath}`,
    '',
    '  v4.0 removed PIN encryption. To migrate:',
    '',
    '    1. npm install -g @t2000/cli@3',
    '    2. t2000 export                      # save the suiprivkey1... string',
    '    3. npm install -g @t2000/cli@4',
    '    4. t2 init --import                  # paste the secret (hidden input)',
    '',
    '  Or send your USDC to a fresh v4.x wallet (`t2 init`) from your v3.x',
    '  wallet before upgrading.',
    '',
  ].join('\n');
}

/**
 * Pure formatter — kept separate from I/O so tests can pin the banner
 * shape without printing to stderr.
 */
export function legacyWalletErrorMessage(filePath: string): string {
  return `Legacy v3.x AES wallet detected at ${filePath}. Run 't2 init --import' to recover.`;
}
