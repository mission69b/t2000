import { getSuiClient } from '../packages/sdk/src/utils/sui.js';
import { keypairFromPrivateKey } from '../packages/sdk/src/wallet/keyManager.js';

async function main() {
  const { getPool, getPools, getCoins, getLendingState, getHealthFactor } = await import('@naviprotocol/lending');

  const pk = process.env.T2000_PASSPHRASE!;
  const keypair = keypairFromPrivateKey(pk);
  const address = keypair.getPublicKey().toSuiAddress();
  const client = getSuiClient();

  const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

  console.log('Address:', address);

  // Test getPools first
  try {
    const pools = await getPools({ env: 'prod' });
    console.log(`getPools: ${pools.length} pools`);
    const usdcPool = pools.find((p: { token?: { symbol?: string }; coinType?: string }) =>
      p.token?.symbol === 'USDC' || p.coinType?.toLowerCase().includes('usdc')
    );
    if (usdcPool) {
      console.log(`  USDC pool id: ${usdcPool.id}`);
      console.log(`  USDC coinType: ${usdcPool.coinType}`);
      console.log(`  USDC symbol: ${usdcPool.token?.symbol}`);
      console.log(`  USDC decimals: ${usdcPool.token?.decimals}`);
      console.log(`  USDC supplyRate: ${usdcPool.currentSupplyRate?.toString().slice(0, 20)}`);
      console.log(`  USDC borrowRate: ${usdcPool.currentBorrowRate?.toString().slice(0, 20)}`);
      console.log(`  USDC ltv: ${usdcPool.ltv}`);
      console.log(`  USDC liqThreshold: ${usdcPool.liquidationFactor?.threshold}`);
    } else {
      console.log('  USDC pool NOT FOUND');
    }
  } catch(e: unknown) { console.log('getPools error:', (e as Error).message.slice(0, 200)); }

  // Test getPool with full coin type
  try {
    const pool = await getPool(USDC_TYPE, { env: 'prod' });
    console.log('getPool(coinType):', pool?.token?.symbol, 'id:', pool?.id);
  } catch(e: unknown) { console.log('getPool(coinType) error:', (e as Error).message.slice(0, 200)); }

  // Test getCoins
  try {
    const coins = await getCoins(address, { coinType: USDC_TYPE, client });
    console.log(`getCoins: ${coins?.length ?? 'undefined'} USDC coins`);
  } catch(e: unknown) { console.log('getCoins error:', (e as Error).message.slice(0, 200)); }

  // Test getLendingState
  try {
    const state = await getLendingState(address, { client, env: 'prod' });
    console.log(`getLendingState: ${state?.length ?? 'undefined'} positions`);
  } catch(e: unknown) { console.log('getLendingState error:', (e as Error).message.slice(0, 200)); }

  // Test getHealthFactor
  try {
    const hf = await getHealthFactor(address, { client, env: 'prod' });
    console.log('getHealthFactor:', hf);
  } catch(e: unknown) { console.log('getHealthFactor error:', (e as Error).message.slice(0, 200)); }

  console.log('\nDone.');
}

main().catch(e => console.error('Fatal:', e));
