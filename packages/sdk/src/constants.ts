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
    displayName: 'USDC',
  },
  USDT: {
    type: '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT',
    decimals: 6,
    symbol: 'USDT',
    displayName: 'suiUSDT',
  },
  USDe: {
    type: '0x41d587e5336f1c86cad50d38a7136db99333bb9bda91cea4ba69115defeb1402::sui_usde::SUI_USDE',
    decimals: 6,
    symbol: 'USDe',
    displayName: 'suiUSDe',
  },
  USDsui: {
    type: '0x44f838219cf67b058f3b37907b655f226153c18e33dfcd0da559a844fea9b1c1::usdsui::USDSUI',
    decimals: 6,
    symbol: 'USDsui',
    displayName: 'USDsui',
  },
  SUI: {
    type: '0x2::sui::SUI',
    decimals: 9,
    symbol: 'SUI',
    displayName: 'SUI',
  },
  BTC: {
    type: '0xaafb102dd0902f5055cadecd687fb5b71ca82ef0e0285d90afde828ec58ca96b::btc::BTC',
    decimals: 8,
    symbol: 'BTC',
    displayName: 'Bitcoin',
  },
  ETH: {
    type: '0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH',
    decimals: 8,
    symbol: 'ETH',
    displayName: 'Ethereum',
  },
} as const;

export type SupportedAsset = keyof typeof SUPPORTED_ASSETS;
export type StableAsset = Exclude<SupportedAsset, 'SUI' | 'BTC' | 'ETH'>;
export const STABLE_ASSETS: readonly StableAsset[] = ['USDC', 'USDT', 'USDe', 'USDsui'] as const;

export const T2000_PACKAGE_ID = process.env.T2000_PACKAGE_ID ?? '0xab92e9f1fe549ad3d6a52924a73181b45791e76120b975138fac9ec9b75db9f3';
export const T2000_CONFIG_ID = process.env.T2000_CONFIG_ID ?? '0x408add9aa9322f93cfd87523d8f603006eb8713894f4c460283c58a6888dae8a';
export const T2000_ADMIN_CAP_ID = '0x863d1b02cba1b93d0fe9b87eb92d58b60c1e85c001022cb2a760e07bade47e65';
export const T2000_TREASURY_ID = process.env.T2000_TREASURY_ID ?? '0x3bb501b8300125dca59019247941a42af6b292a150ce3cfcce9449456be2ec91';

export const DEFAULT_NETWORK = 'mainnet' as const;
export const DEFAULT_RPC_URL = 'https://fullnode.mainnet.sui.io:443';
export const DEFAULT_KEY_PATH = '~/.t2000/wallet.key';
export const DEFAULT_CONFIG_PATH = '~/.t2000/config.json';

export const API_BASE_URL = process.env.T2000_API_URL ?? 'https://api.t2000.ai';

export const CETUS_USDC_SUI_POOL = '0x51e883ba7c0b566a26cbc8a94cd33eb0abd418a77cc1e60ad22fd9b1f29cd2ab';
export const CETUS_GLOBAL_CONFIG = '0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e4438403a67a3d8f';
export const CETUS_PACKAGE = '0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb';

// --- Investment ---

export const INVESTMENT_ASSETS = {
  SUI: SUPPORTED_ASSETS.SUI,
  BTC: SUPPORTED_ASSETS.BTC,
  ETH: SUPPORTED_ASSETS.ETH,
} as const;

export type InvestmentAsset = keyof typeof INVESTMENT_ASSETS;

export const PERPS_MARKETS = ['SUI-PERP'] as const;
export type PerpsMarket = (typeof PERPS_MARKETS)[number];

export const DEFAULT_MAX_LEVERAGE = 5;
export const DEFAULT_MAX_POSITION_SIZE = 1000;
export const INVEST_FEE_BPS = 0n;
export const GAS_RESERVE_MIN = 0.05; // minimum SUI to keep for gas

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
