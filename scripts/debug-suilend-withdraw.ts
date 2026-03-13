import { Transaction } from '@mysten/sui/transactions';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { T2000 } from '../packages/sdk/src/index.js';

const LENDING_MARKET_ID = '0x84030d26d85eaa7035084a057f2f11f701b7e2e4eda87551becbc7c97505ece1';
const LENDING_MARKET_TYPE = '0xf95b06141ed4a174f239417323bde3f209b972f5930d8521ea38a52aff3a6ddf::suilend::MAIN_POOL';
const SUILEND_PACKAGE = '0xf95b06141ed4a174f239417323bde3f209b972f5930d8521ea38a52aff3a6ddf';
const PKG = '0x3d4353f3bd3565329655e6b77bc2abfd31e558b86662ebd078ae453d416bc10f';
const CLOCK = '0x6';
const SUI_TYPE = '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI';

async function main() {
  const key = process.env.T2000_PASSPHRASE ?? process.env.T2000_PIN;
  if (!key) { console.error('Set T2000_PASSPHRASE or T2000_PIN'); process.exit(1); }
  const agent = T2000.fromPrivateKey(key);
  const address = agent.address();
  const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl('mainnet'), network: 'mainnet' });

  console.log('Address:', address);

  // Fetch obligation caps
  const capType = `${SUILEND_PACKAGE}::lending_market::ObligationOwnerCap<${LENDING_MARKET_TYPE}>`;
  const capsPage = await client.getOwnedObjects({ owner: address, filter: { StructType: capType }, options: { showContent: true } });
  const cap = capsPage.data[0];
  if (!cap?.data) { console.error('No obligation cap found'); return; }
  const capId = cap.data.objectId;
  const oblId = ((cap.data.content as any).fields as any).obligation_id;
  console.log('Cap:', capId, '→ Obligation:', oblId);

  // Try different amounts
  const amounts = [
    { label: 'Tiny (1 cToken)', value: '1' },
    { label: 'Small (1000 cTokens)', value: '1000' },
    { label: 'Our calculated (20B)', value: '20094565610' },
    { label: 'U64_MAX', value: '18446744073709551615' },
  ];

  // Test 1: withdraw_ctokens alone (no redeem) — see if cToken withdrawal works
  console.log('\n--- Test 1: withdraw_ctokens only (U64_MAX) ---');
  {
    const tx = new Transaction();
    tx.setSender(address);
    const [ctokens] = tx.moveCall({
      target: `${PKG}::lending_market::withdraw_ctokens`,
      typeArguments: [LENDING_MARKET_TYPE, SUI_TYPE],
      arguments: [
        tx.object(LENDING_MARKET_ID), tx.pure.u64(0), tx.object(capId),
        tx.object(CLOCK), tx.pure('u64', BigInt('18446744073709551615')),
      ],
    });
    tx.transferObjects([ctokens], address);
    try {
      const txBytes = await tx.build({ client });
      const dryRun = await client.dryRunTransactionBlock({ transactionBlock: Buffer.from(txBytes).toString('base64') });
      console.log('Status:', dryRun.effects?.status?.status);
      if (dryRun.effects?.status?.status === 'failure') console.log('Error:', dryRun.effects.status.error);
      else console.log('SUCCESS — cToken withdrawal works alone');
    } catch (e: any) { console.log('Error:', e.message?.substring(0, 300)); }
  }

  // Test 2: Full flow with refresh_reserve_price first
  console.log('\n--- Test 2: refresh_reserve_price + withdraw + redeem (1000 cTokens) ---');
  {
    const tx = new Transaction();
    tx.setSender(address);

    // Get Pyth price info object for SUI
    // Suilend stores the price_identifier in the reserve. We need the PriceInfoObject on Sui.
    // SUI price feed ID: 0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744
    // Known PriceInfoObject for SUI on mainnet:
    const suiPriceInfoObj = '0x801dbc2f0053d34734814b2d6df491ce7807a725fe9a01ad74a07e9c51396c37';

    tx.moveCall({
      target: `${PKG}::lending_market::refresh_reserve_price`,
      typeArguments: [LENDING_MARKET_TYPE],
      arguments: [
        tx.object(LENDING_MARKET_ID),
        tx.pure.u64(0),
        tx.object(CLOCK),
        tx.object(suiPriceInfoObj),
      ],
    });

    const exemptionType = `${SUILEND_PACKAGE}::lending_market::RateLimiterExemption<${LENDING_MARKET_TYPE}, ${SUI_TYPE}>`;
    const [ctokens] = tx.moveCall({
      target: `${PKG}::lending_market::withdraw_ctokens`,
      typeArguments: [LENDING_MARKET_TYPE, SUI_TYPE],
      arguments: [
        tx.object(LENDING_MARKET_ID), tx.pure.u64(0), tx.object(capId),
        tx.object(CLOCK), tx.pure('u64', BigInt('1000')),
      ],
    });
    const [none] = tx.moveCall({
      target: '0x1::option::none',
      typeArguments: [exemptionType],
    });
    const [coin] = tx.moveCall({
      target: `${PKG}::lending_market::redeem_ctokens_and_withdraw_liquidity`,
      typeArguments: [LENDING_MARKET_TYPE, SUI_TYPE],
      arguments: [
        tx.object(LENDING_MARKET_ID), tx.pure.u64(0), tx.object(CLOCK), ctokens, none,
      ],
    });
    tx.transferObjects([coin], address);
    try {
      const txBytes = await tx.build({ client });
      const dryRun = await client.dryRunTransactionBlock({ transactionBlock: Buffer.from(txBytes).toString('base64') });
      console.log('Status:', dryRun.effects?.status?.status);
      if (dryRun.effects?.status?.status === 'failure') console.log('Error:', dryRun.effects.status.error);
      else console.log('SUCCESS — refresh + withdraw + redeem works!');
    } catch (e: any) { console.log('Error:', e.message?.substring(0, 300)); }
  }

  // Test 3: 3-step flow: request + unstake_sui_from_staker + fulfill (THE FIX)
  console.log('\n--- Test 3: request + unstake_sui_from_staker + fulfill (U64_MAX) ---');
  {
    const SUI_SYSTEM_STATE = '0x5';
    const tx = new Transaction();
    tx.setSender(address);
    const exemptionType = `${SUILEND_PACKAGE}::lending_market::RateLimiterExemption<${LENDING_MARKET_TYPE}, ${SUI_TYPE}>`;
    const [ctokens] = tx.moveCall({
      target: `${PKG}::lending_market::withdraw_ctokens`,
      typeArguments: [LENDING_MARKET_TYPE, SUI_TYPE],
      arguments: [
        tx.object(LENDING_MARKET_ID), tx.pure.u64(0), tx.object(capId),
        tx.object(CLOCK), tx.pure('u64', BigInt('18446744073709551615')),
      ],
    });
    const [none] = tx.moveCall({
      target: '0x1::option::none',
      typeArguments: [exemptionType],
    });
    const [liquidityRequest] = tx.moveCall({
      target: `${PKG}::lending_market::redeem_ctokens_and_withdraw_liquidity_request`,
      typeArguments: [LENDING_MARKET_TYPE, SUI_TYPE],
      arguments: [
        tx.object(LENDING_MARKET_ID), tx.pure.u64(0), tx.object(CLOCK), ctokens, none,
      ],
    });
    tx.moveCall({
      target: `${PKG}::lending_market::unstake_sui_from_staker`,
      typeArguments: [LENDING_MARKET_TYPE],
      arguments: [
        tx.object(LENDING_MARKET_ID), tx.pure.u64(0), liquidityRequest, tx.object(SUI_SYSTEM_STATE),
      ],
    });
    const [coin] = tx.moveCall({
      target: `${PKG}::lending_market::fulfill_liquidity_request`,
      typeArguments: [LENDING_MARKET_TYPE, SUI_TYPE],
      arguments: [
        tx.object(LENDING_MARKET_ID), tx.pure.u64(0), liquidityRequest,
      ],
    });
    tx.transferObjects([coin], address);
    try {
      const txBytes = await tx.build({ client });
      const dryRun = await client.dryRunTransactionBlock({ transactionBlock: Buffer.from(txBytes).toString('base64') });
      console.log('Status:', dryRun.effects?.status?.status);
      if (dryRun.effects?.status?.status === 'failure') console.log('Error:', dryRun.effects.status.error);
      else console.log('SUCCESS — 3-step flow with unstake works!');
    } catch (e: any) { console.log('Error:', e.message?.substring(0, 300)); }
  }
}

main().catch(console.error);
