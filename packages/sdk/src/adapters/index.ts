export type {
  AdapterCapability,
  AdapterTxResult,
  LendingRates,
  AdapterPositions,
  HealthInfo,
  SwapQuote,
  LendingAdapter,
  SwapAdapter,
  ProtocolDescriptor,
} from './types.js';
export { ProtocolRegistry } from './registry.js';
export { NaviAdapter, descriptor as naviDescriptor } from './navi.js';
export { CetusAdapter, descriptor as cetusDescriptor } from './cetus.js';
export { SuilendAdapter, descriptor as suilendDescriptor } from './suilend.js';
export { descriptor as sentinelDescriptor } from '../protocols/sentinel.js';

import { descriptor as naviDescriptor } from './navi.js';
import { descriptor as cetusDescriptor } from './cetus.js';
import { descriptor as suilendDescriptor } from './suilend.js';
import { descriptor as sentinelDescriptor } from '../protocols/sentinel.js';
import type { ProtocolDescriptor } from './types.js';

/** All registered protocol descriptors — used by the indexer for event classification */
export const allDescriptors: ProtocolDescriptor[] = [
  naviDescriptor,
  suilendDescriptor,
  cetusDescriptor,
  sentinelDescriptor,
];
