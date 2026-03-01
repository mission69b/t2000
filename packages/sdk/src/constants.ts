export const MIST_PER_SUI = 1_000_000_000n;
export const SUI_DECIMALS = 9;
export const USDC_DECIMALS = 6;

export const BPS_DENOMINATOR = 10_000n;
export const PRECISION = 1_000_000_000_000_000_000n;

export const MIN_DEPOSIT = 1_000_000n; // 1 USDC (6 decimals)
export const GAS_RESERVE_USDC = 1_000_000n; // $1 USDC reserved for gas
export const AUTO_TOPUP_THRESHOLD = 50_000_000n; // 0.05 SUI
export const AUTO_TOPUP_AMOUNT = 1_000_000n; // $1 USDC worth of SUI
export const AUTO_TOPUP_MIN_USDC = 2_000_000n; // $2 USDC minimum to trigger auto-topup
export const BOOTSTRAP_LIMIT = 10;
export const GAS_FEE_CEILING_USD = 0.05;

export const SAVE_FEE_BPS = 10n; // 0.1%
export const SWAP_FEE_BPS = 0n; // Free — Cetus already charges pool fees
export const BORROW_FEE_BPS = 5n; // 0.05%

export const CLOCK_ID = '0x6';

export const SUPPORTED_ASSETS = {
  USDC: {
    type: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
    decimals: 6,
    symbol: 'USDC',
  },
  SUI: {
    type: '0x2::sui::SUI',
    decimals: 9,
    symbol: 'SUI',
  },
} as const;

export type SupportedAsset = keyof typeof SUPPORTED_ASSETS;

export const T2000_PACKAGE_ID = process.env.T2000_PACKAGE_ID ?? '0x51c44bb2ad3ba608cf9adbc6e37ee67268ef9313a4ff70957d4c6e7955dc7eef';
export const T2000_CONFIG_ID = process.env.T2000_CONFIG_ID ?? '0xd30408960ac38eced670acc102df9e178b5b46b3a8c0e96a53ec2fd3f39b5936';
export const T2000_ADMIN_CAP_ID = '0x8f8a1147f9e52738485817ee499736d878546f079fc99d5560cdd570fec7d13e';
export const T2000_UPGRADE_CAP_ID = '0x9627206ae0265afaae354864116b1cd152cb872ca28dfb4cd8d50ad46f69d7fa';
export const T2000_TREASURY_ID = process.env.T2000_TREASURY_ID ?? '0x2398c2759cfce40f1b0f2b3e524eeba9e8f6428fcb1d1e39235dd042d48defc8';

export const DEFAULT_NETWORK = 'mainnet' as const;
export const DEFAULT_RPC_URL = 'https://fullnode.mainnet.sui.io:443';
export const DEFAULT_KEY_PATH = '~/.t2000/wallet.key';
export const DEFAULT_CONFIG_PATH = '~/.t2000/config.json';

export const API_BASE_URL = process.env.T2000_API_URL ?? 'https://api.t2000.ai';

export const CETUS_USDC_SUI_POOL = '0x51e883ba7c0b566a26cbc8a94cd33eb0abd418a77cc1e60ad22fd9b1f29cd2ab';
export const CETUS_GLOBAL_CONFIG = '0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e4438403a67a3d8f';
export const CETUS_PACKAGE = '0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb';

export const SENTINEL = {
  PACKAGE: '0x88b83f36dafcd5f6dcdcf1d2cb5889b03f61264ab3cee9cae35db7aa940a21b7',
  AGENT_REGISTRY: '0xc47564f5f14c12b31e0dfa1a3dc99a6380a1edf8929c28cb0eaa3359c8db36ac',
  ENCLAVE: '0xfb1261aeb9583514cb1341a548a5ec12d1231bd96af22215f1792617a93e1213',
  PROTOCOL_CONFIG: '0x2fa4fa4a1dd0498612304635ff9334e1b922e78af325000e9d9c0e88adea459f',
  TEE_API: 'https://app.suisentinel.xyz/api/consume-prompt',
  SENTINELS_API: 'https://api.suisentinel.xyz/agents/mainnet',
  RANDOM: '0x8',
  MIN_FEE_MIST: 100_000_000n, // 0.1 SUI
  MAX_PROMPT_TOKENS: 600,
} as const;
