import * as lending from '@naviprotocol/lending';
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

async function main() {
  const decoded = decodeSuiPrivateKey(process.env.T2000_PASSPHRASE!);
  const keypair = Ed25519Keypair.fromSecretKey(decoded.secretKey);
  const address = keypair.getPublicKey().toSuiAddress();
  const client = new SuiClient({ url: 'https://fullnode.mainnet.sui.io:443' });

  console.log('Address:', address);

  try {
    const pools = await lending.getPools({ env: 'prod' });
    console.log(`getPools: ${pools.length} pools`);
    const usdcPool = pools.find((p: { token?: { symbol?: string }; coinType?: string }) =>
      p.token?.symbol === 'USDC' || p.coinType?.toLowerCase().includes('usdc')
    );
    if (usdcPool) {
      console.log(`  id: ${usdcPool.id}, coinType: ${usdcPool.coinType?.slice(0,50)}...`);
      console.log(`  symbol: ${usdcPool.token?.symbol}, decimals: ${usdcPool.token?.decimals}`);
      console.log(`  supplyRate: ${usdcPool.currentSupplyRate}`);
      console.log(`  borrowRate: ${usdcPool.currentBorrowRate}`);
      console.log(`  ltv: ${usdcPool.ltv}, liqThreshold: ${usdcPool.liquidationFactor?.threshold}`);
    }
  } catch(e: unknown) { console.log('getPools error:', (e as Error).message.slice(0, 300)); }

  try {
    const pool = await lending.getPool(USDC_TYPE, { env: 'prod' });
    console.log('getPool(coinType):', pool?.token?.symbol, 'id:', pool?.id);
  } catch(e: unknown) { console.log('getPool(coinType) error:', (e as Error).message.slice(0, 300)); }

  try {
    const coins = await lending.getCoins(address, { coinType: USDC_TYPE, client });
    console.log(`getCoins: ${coins?.length ?? 'undefined'} coins`);
  } catch(e: unknown) { console.log('getCoins error:', (e as Error).message.slice(0, 300)); }

  try {
    const state = await lending.getLendingState(address, { client, env: 'prod' });
    console.log(`getLendingState: ${state?.length ?? 'undefined'} positions`);
  } catch(e: unknown) { console.log('getLendingState error:', (e as Error).message.slice(0, 300)); }

  try {
    const hf = await lending.getHealthFactor(address, { client, env: 'prod' });
    console.log('getHealthFactor:', hf);
  } catch(e: unknown) {
    console.log('getHealthFactor error:', (e as Error).message.slice(0, 300));
  }

  console.log('\nDone.');
}

main().catch(e => console.error('Fatal:', e));
