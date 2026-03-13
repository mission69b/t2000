import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

const UPGRADE_CAP_ID = '0x3d4ef1859c3ee9fc72858f588b56a09da5466e64f8cc4e90a7b3b909fba8a7ae';
const FALLBACK = '0x3d4353f3bd3565329655e6b77bc2abfd31e558b86662ebd078ae453d416bc10f';

async function main() {
  const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl('mainnet'), network: 'mainnet' });

  const cap = await client.getObject({ id: UPGRADE_CAP_ID, options: { showContent: true } });
  const fields = (cap.data?.content as any)?.fields;
  console.log('UpgradeCap package:', fields?.package);
  console.log('FALLBACK_PUBLISHED_AT:', FALLBACK);
  console.log('Match:', fields?.package === FALLBACK);

  if (fields?.package && fields.package !== FALLBACK) {
    console.log('\n*** PACKAGE VERSION MISMATCH! ***');
    console.log('Latest on-chain:', fields.package);
    console.log('Our fallback:', FALLBACK);
  }
}

main().catch(console.error);
