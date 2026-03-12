import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl('mainnet'), network: 'mainnet' });

const PROTOCOL_ID = '0x01d9cf05d65fa3a9bb7163095139120e3c4e414dfbab153a49779a7d14010b93';
const MARKETS_TABLE_ID = '0x2326d387ba8bb7d24aa4cfa31f9a1e58bf9234b097574afb06c5dfb267df4c2e';

const KNOWN_TYPES: Record<string, string> = {
  '0000000000000000000000000000000000000000000000000000000000000002::sui::SUI': 'SUI',
  'dba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC': 'USDC',
  'c060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN': 'USDT',
  '0041f9f9344cac094454cd574e333c4fdb132d7bcc9379bcd4aab485b2a63942::wbtc::WBTC': 'wBTC (LayerZero)',
  'd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH': 'wETH (SuiBridge)',
  'aafb102dd0902f5055cadecd687fb5b71ca82ef0e0285d90afde828ec58ca96b::btc::BTC': 'wBTC (SuiBridge)',
  'd1b72982e40348d069bb1ff701e634c117bb5f741f44dff91e472d3b01461e55::stsui::STSUI': 'stSUI',
  '549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT': 'vSUI',
  'fe3afec26c59e874f3c1d60b8203cb3852d2bb2aa415df9548b8d688e6683f93::alpha::ALPHA': 'ALPHA',
};

async function main() {
  console.log('\n── AlphaLend Market Discovery ──\n');

  const mtDynFields = await client.getDynamicFields({
    parentId: MARKETS_TABLE_ID,
    limit: 50,
  });

  const markets: { id: number; coinType: string; label: string; tvl: string; borrowed: string }[] = [];

  for (const df of mtDynFields.data) {
    const marketId = Number(df.name.value);
    const obj = await client.getObject({
      id: df.objectId,
      options: { showContent: true },
    });
    const f = (obj.data?.content as any)?.fields;
    const val = f?.value?.fields;
    if (!val) continue;

    const coinTypeName = val.coin_type?.fields?.name || 'unknown';
    const fullType = `0x${coinTypeName}`;
    const label = KNOWN_TYPES[coinTypeName] || coinTypeName.split('::').pop() || 'unknown';
    const tvl = val.balance_holding || '0';
    const borrowed = val.borrowed_amount || '0';

    markets.push({ id: marketId, coinType: fullType, label, tvl, borrowed });
  }

  markets.sort((a, b) => a.id - b.id);

  console.log(`Found ${markets.length} markets:\n`);
  console.log('ID  | Asset                | TVL               | Borrowed          | Coin Type');
  console.log('----|----------------------|-------------------|-------------------|--------------------------------------------------');
  for (const m of markets) {
    const idStr = String(m.id).padEnd(3);
    const labelStr = m.label.padEnd(20);
    const tvlStr = m.tvl.padStart(17);
    const borrowStr = m.borrowed.padStart(17);
    console.log(`${idStr} | ${labelStr} | ${tvlStr} | ${borrowStr} | ${m.coinType.slice(0, 48)}...`);
  }
}

main().catch(console.error);
