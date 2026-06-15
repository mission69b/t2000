import type { SuiGrpcClient } from '@mysten/sui/grpc';
import type { TransactionSigner } from '../signer.js';
import type { PayOptions, PayResult } from '../types.js';
import { parseChallengeAmount } from '../mpp-cost.js';
import { executeTx } from './executeTx.js';

// ---------------------------------------------------------------------------
// payWithMpp — gasless MPP payment, the SDK's single source of truth for the
// pay loop. Browser-safe (no fs / keyManager / SafeguardEnforcer), so the
// Audric client can run it in-browser on the zkLogin session key (the
// unified gasless write path — see SPEC_AUDRIC_MPP_REENABLE.md "Write-path
// unification"). `T2000.pay()` delegates here after its enforcer checks; the
// browser caller skips the enforcer entirely (the server budget ledger owns
// the cap). Spend accounting is left to the caller via the returned
// `PayResult.paid` / `cost`.
// ---------------------------------------------------------------------------

export async function payWithMpp(args: {
  signer: TransactionSigner;
  client: SuiGrpcClient;
  options: PayOptions;
}): Promise<PayResult> {
  const { signer, client, options } = args;

  const { Mppx } = await import('mppx/client');
  const { sui, USDC } = await import('@suimpp/mpp/client');
  const { SuiGrpcClient } = await import('@mysten/sui/grpc');

  const signerAddress = signer.getAddress();

  let paymentDigest: string | undefined;
  let gasCostSui = 0;
  // [Bug 1 / dogfood 2026-05-31] The real amount charged on-chain is the 402
  // challenge price (a decimal USDC string like "0.01"), NOT the caller's
  // `maxPrice` ceiling. mppx surfaces the parsed challenge via `onChallenge`
  // before paying; we capture `request.amount` there and report THAT as
  // `cost`. Returning `undefined` from the hook lets mppx fall through to
  // normal credential resolution, so capture is side-effect-only.
  let chargedAmount: number | undefined;

  // [2026-05-22] Gasless MPP. Build the payment PTB via SuiGrpcClient so the
  // SDK's gasless-eligibility resolver runs at build time. When the PTB is
  // `0x2::balance::send_funds` on an allowlisted stablecoin (USDC, USDsui,
  // USDY, FdUSD, AUSD, BUCK, USDB, SUI_USDE), the resolver sets gasPrice=0,
  // gasBudget=0, gasPayment=[] automatically. The protocol then accepts the
  // tx for $0 gas. Submission stays on JSON-RPC (build via gRPC, execute via
  // JSON-RPC hybrid):
  // https://docs.sui.io/develop/transaction-payment/gasless-stablecoin-transfers
  const network: 'mainnet' | 'testnet' = client.network === 'testnet' ? 'testnet' : 'mainnet';
  const grpcBaseUrl =
    network === 'testnet'
      ? 'https://fullnode.testnet.sui.io'
      : 'https://fullnode.mainnet.sui.io';
  const grpcClient = new SuiGrpcClient({ baseUrl: grpcBaseUrl, network });

  const mppx = Mppx.create({
    polyfill: false,
    onChallenge: async (challenge: { request?: { amount?: unknown } }) => {
      const parsed = parseChallengeAmount(challenge);
      if (parsed !== undefined) chargedAmount = parsed;
      return undefined;
    },
    methods: [sui({
      client,
      currency: USDC,
      signer: {
        toSuiAddress: () => signerAddress,
        signPersonalMessage: (bytes: Uint8Array) => signer.signPersonalMessage(bytes),
      } as Parameters<typeof sui>[0]['signer'],
      execute: async (tx) => {
        const result = await executeTx(client, signer, () => tx, { buildClient: grpcClient });
        paymentDigest = result.digest;
        gasCostSui = result.gasCostSui;
        return { digest: result.digest };
      },
    })],
  });

  const method = (options.method ?? 'GET').toUpperCase();
  const canHaveBody = method !== 'GET' && method !== 'HEAD';

  const response = await mppx.fetch(options.url, {
    method,
    headers: options.headers,
    body: canHaveBody ? options.body : undefined,
  });

  const contentType = response.headers.get('content-type') ?? '';
  let body: unknown;
  try {
    body = contentType.includes('application/json')
      ? await response.json()
      : await response.text();
  } catch {
    body = null;
  }

  const paid = !!paymentDigest;

  return {
    status: response.status,
    body,
    paid,
    cost: paid ? (chargedAmount ?? options.maxPrice ?? undefined) : undefined,
    gasCostSui: paid ? gasCostSui : undefined,
    receipt: paymentDigest
      ? { reference: paymentDigest, timestamp: new Date().toISOString() }
      : undefined,
  };
}
