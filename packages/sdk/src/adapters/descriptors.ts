import type { ProtocolDescriptor } from './types.js';

export type { ProtocolDescriptor } from './types.js';

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

export const allDescriptors: ProtocolDescriptor[] = [
  naviDescriptor,
];
