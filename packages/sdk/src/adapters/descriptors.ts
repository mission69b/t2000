import type { ProtocolDescriptor } from './types.js';
import { CETUS_PACKAGE } from '../constants.js';

export type { ProtocolDescriptor } from './types.js';

const SUILEND_PACKAGE = '0xf95b06141ed4a174f239417323bde3f209b972f5930d8521ea38a52aff3a6ddf';

export const naviDescriptor: ProtocolDescriptor = {
  id: 'navi',
  name: 'NAVI Protocol',
  packages: [],
  dynamicPackageId: true,
  actionMap: {
    'incentive_v3::entry_deposit': 'save',
    'incentive_v3::deposit': 'save',
    'incentive_v3::withdraw_v2': 'withdraw',
    'incentive_v3::entry_withdraw': 'withdraw',
    'incentive_v3::borrow_v2': 'borrow',
    'incentive_v3::entry_borrow': 'borrow',
    'incentive_v3::entry_repay': 'repay',
    'incentive_v3::repay': 'repay',
  },
};

export const suilendDescriptor: ProtocolDescriptor = {
  id: 'suilend',
  name: 'Suilend',
  packages: [SUILEND_PACKAGE],
  actionMap: {
    'lending_market::deposit_liquidity_and_mint_ctokens': 'save',
    'lending_market::deposit_ctokens_into_obligation': 'save',
    'lending_market::create_obligation': 'save',
    'lending_market::withdraw_ctokens': 'withdraw',
    'lending_market::redeem_ctokens_and_withdraw_liquidity': 'withdraw',
    'lending_market::redeem_ctokens_and_withdraw_liquidity_request': 'withdraw',
    'lending_market::fulfill_liquidity_request': 'withdraw',
    'lending_market::unstake_sui_from_staker': 'withdraw',
    'lending_market::borrow': 'borrow',
    'lending_market::repay': 'repay',
  },
};

export const cetusDescriptor: ProtocolDescriptor = {
  id: 'cetus',
  name: 'Cetus DEX',
  packages: [CETUS_PACKAGE],
  actionMap: {
    'router::swap': 'swap',
    'router::swap_ab_bc': 'swap',
    'router::swap_ab_cb': 'swap',
    'router::swap_ba_bc': 'swap',
    'router::swap_ba_cb': 'swap',
  },
};

export const allDescriptors: ProtocolDescriptor[] = [
  naviDescriptor,
  suilendDescriptor,
  cetusDescriptor,
];
