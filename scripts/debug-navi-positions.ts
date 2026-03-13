import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { T2000 } from '../packages/sdk/src/index.js';

const CONFIG_API = 'https://open-api.naviprotocol.io/api/navi/config?env=prod';
const POOLS_API = 'https://open-api.naviprotocol.io/api/navi/pools?env=prod';

const UserStateInfo = bcs.struct('UserStateInfo', {
  asset_id: bcs.u8(),
  borrow_balance: bcs.u256(),
  supply_balance: bcs.u256(),
});

async function main() {
  const agent = await T2000.create({ pin: process.env.T2000_PIN });
  const bal = await agent.balance();
  const address = bal.address ?? (agent as unknown as { _address: string })._address;
  console.log('Address:', address);
  console.log();

  const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl('mainnet'), network: 'mainnet' });

  const configRes = await fetch(CONFIG_API);
  const configJson = (await configRes.json()) as { data?: Record<string, unknown> };
  const config = (configJson.data ?? configJson) as Record<string, unknown>;

  const poolsRes = await fetch(POOLS_API);
  const poolsJson = (await poolsRes.json()) as { data?: Array<Record<string, unknown>> };
  const pools = (poolsJson.data ?? poolsJson) as Array<Record<string, unknown>>;

  const tx = new Transaction();
  tx.moveCall({
    target: `${config.uiGetter}::getter_unchecked::get_user_state`,
    arguments: [tx.object(config.storage as string), tx.pure('address', address)],
  });

  const result = await client.devInspectTransactionBlock({
    transactionBlock: tx,
    sender: address,
  });

  const returnValues = result.results?.[0]?.returnValues;
  if (!returnValues || returnValues.length === 0) {
    console.log('No return values from getUserState!');
    return;
  }

  const decoded = bcs.vector(UserStateInfo).parse(new Uint8Array(returnValues[0][0]));

  console.log(`=== Raw User States (${decoded.length} entries) ===`);
  for (const s of decoded) {
    const pool = pools.find((p: Record<string, unknown>) => p.id === s.asset_id);
    const poolSymbol = pool ? (pool.token as Record<string, unknown>)?.symbol : 'NO POOL MATCH';
    const supplyRaw = BigInt(s.supply_balance);
    const borrowRaw = BigInt(s.borrow_balance);
    console.log(`  assetId=${s.asset_id}  pool=${poolSymbol}  supply=${supplyRaw}  borrow=${borrowRaw}`);

    if (pool) {
      const supplyIndex = pool.currentSupplyIndex as string;
      const borrowIndex = pool.currentBorrowIndex as string;
      const scale = BigInt('1' + '0'.repeat(27));
      const half = scale / 2n;
      const compoundedSupply = (supplyRaw * BigInt(supplyIndex) + half) / scale;
      const compoundedBorrow = (borrowRaw * BigInt(borrowIndex) + half) / scale;
      const decimals = (pool.token as Record<string, unknown>)?.decimals as number ?? 9;
      console.log(`    → compounded supply: ${Number(compoundedSupply) / 1e9} (div 1e9)  or  ${Number(compoundedSupply) / 10 ** decimals} (div 1e${decimals})`);
      if (borrowRaw > 0n) {
        console.log(`    → compounded borrow: ${Number(compoundedBorrow) / 1e9} (div 1e9)  or  ${Number(compoundedBorrow) / 10 ** decimals} (div 1e${decimals})`);
      }
    }
  }
}

main().catch(console.error);
