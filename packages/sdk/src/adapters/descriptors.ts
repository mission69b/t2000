import type { ProtocolDescriptor } from './types.js';

export type { ProtocolDescriptor } from './types.js';

export const naviDescriptor: ProtocolDescriptor = {
  id: 'navi',
  name: 'NAVI Protocol',
  packages: [],
  dynamicPackageId: true,
  actionMap: {
    // Deposit variants (entry_deposit / deposit + account-cap form for
    // harvest's internal save leg)
    'incentive_v3::entry_deposit': 'save',
    'incentive_v3::deposit': 'save',
    'incentive_v3::deposit_with_account_cap': 'save',
    // Withdraw variants
    'incentive_v3::withdraw_v2': 'withdraw',
    'incentive_v3::entry_withdraw': 'withdraw',
    'incentive_v3::withdraw_with_account_cap': 'withdraw',
    'incentive_v3::withdraw_with_account_cap_v': 'withdraw',
    'incentive_v3::withdraw': 'withdraw',
    'incentive_v3::withdraw_v': 'withdraw',
    // Borrow variants
    'incentive_v3::borrow_v2': 'borrow',
    'incentive_v3::entry_borrow': 'borrow',
    'incentive_v3::borrow': 'borrow',
    'incentive_v3::borrow_v': 'borrow',
    'incentive_v3::borrow_with_account_cap': 'borrow',
    'incentive_v3::borrow_with_account_cap_v': 'borrow',
    // Repay variants
    'incentive_v3::entry_repay': 'repay',
    'incentive_v3::repay': 'repay',
    'incentive_v3::repay_with_account_cap': 'repay',
    // Claim-reward variants — required for `claim_rewards` tagging AND for
    // `harvest` compound-op detection in the indexer (paired with a save
    // target, classified as `harvest` instead of `claim`).
    'incentive_v3::claim_reward': 'claim',
    'incentive_v3::claim_reward_entry': 'claim',
    'incentive_v3::claim_reward_with_account_cap': 'claim',
  },
};

export const allDescriptors: ProtocolDescriptor[] = [
  naviDescriptor,
];
