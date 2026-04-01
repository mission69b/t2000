import type { McpServerConfig } from './mcp-client.js';

// ---------------------------------------------------------------------------
// NAVI MCP server configuration
// ---------------------------------------------------------------------------

export const NAVI_SERVER_NAME = 'navi';
export const NAVI_MCP_URL = 'https://open-api.naviprotocol.io/api/mcp';

export const NAVI_MCP_CONFIG: McpServerConfig = {
  name: NAVI_SERVER_NAME,
  url: NAVI_MCP_URL,
  transport: 'streamable-http',
  cacheTtlMs: 30_000,
  readOnly: true,
};

// ---------------------------------------------------------------------------
// NAVI MCP tool name constants (as observed from live discovery)
// ---------------------------------------------------------------------------

export const NaviTools = {
  GET_POOLS: 'navi_get_pools',
  GET_POOL: 'navi_get_pool',
  GET_PROTOCOL_STATS: 'navi_get_protocol_stats',
  GET_HEALTH_FACTOR: 'navi_get_health_factor',
  GET_BORROW_FEE: 'navi_get_borrow_fee',
  GET_FEES: 'navi_get_fees',
  GET_FLASH_LOAN_ASSETS: 'navi_get_flash_loan_assets',
  GET_FLASH_LOAN_ASSET: 'navi_get_flash_loan_asset',
  GET_LENDING_REWARDS: 'navi_get_lending_rewards',
  GET_AVAILABLE_REWARDS: 'navi_get_available_rewards',
  GET_PRICE_FEEDS: 'navi_get_price_feeds',
  GET_SWAP_QUOTE: 'navi_get_swap_quote',
  GET_BRIDGE_CHAINS: 'navi_get_bridge_chains',
  SEARCH_BRIDGE_TOKENS: 'navi_search_bridge_tokens',
  GET_BRIDGE_QUOTE: 'navi_get_bridge_quote',
  GET_BRIDGE_TX_STATUS: 'navi_get_bridge_tx_status',
  GET_BRIDGE_HISTORY: 'navi_get_bridge_history',
  GET_DCA_ORDERS: 'navi_get_dca_orders',
  GET_DCA_ORDER_DETAILS: 'navi_get_dca_order_details',
  LIST_DCA_ORDERS: 'navi_list_dca_orders',
  GET_COINS: 'navi_get_coins',
  GET_MARKET_CONFIG: 'navi_get_market_config',
  GET_POSITIONS: 'get_positions',
  GET_TRANSACTION: 'sui_get_transaction',
  EXPLAIN_TRANSACTION: 'sui_explain_transaction',
  SEARCH_TOKENS: 'navi_search_tokens',
} as const;
