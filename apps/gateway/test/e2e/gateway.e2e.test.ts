import { describe, it, expect, beforeAll } from 'vitest';
import { Mppx } from 'mppx/client';
import { sui } from '@mppsui/mpp/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const GATEWAY_URL = process.env.GATEWAY_URL ?? 'https://mpp.t2000.ai';
const NETWORK = (process.env.SUI_NETWORK as 'mainnet' | 'testnet') ?? 'mainnet';
const USE_GRPC = process.env.MPPSUI_USE_GRPC === 'true';

let mppxClient: ReturnType<typeof Mppx.create>;
let paidFetch: typeof globalThis.fetch;

beforeAll(async () => {
  const privateKey = process.env.E2E_TEST_PRIVATE_KEY;
  if (!privateKey) throw new Error('E2E_TEST_PRIVATE_KEY env var is required');

  const keypair = Ed25519Keypair.fromSecretKey(privateKey);
  const address = keypair.getPublicKey().toSuiAddress();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let client: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let signer: any;

  if (USE_GRPC) {
    const { SuiGrpcClient } = await import('@mysten/sui/grpc');
    client = new SuiGrpcClient({ baseUrl: `https://fullnode.${NETWORK}.sui.io:443`, network: NETWORK });
    signer = keypair;
    console.log('Using SuiGrpcClient (PR branch)');
  } else {
    const { SuiJsonRpcClient, getJsonRpcFullnodeUrl } = await import('@mysten/sui/jsonRpc');
    client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(NETWORK), network: NETWORK });
    signer = {
      getAddress: () => address,
      signTransaction: (txBytes: Uint8Array) => keypair.signTransaction(txBytes),
    };
    console.log('Using SuiJsonRpcClient (published npm)');
  }

  console.log(`E2E wallet: ${address}`);
  console.log(`Gateway:    ${GATEWAY_URL}`);
  console.log(`Network:    ${NETWORK}`);

  mppxClient = Mppx.create({
    methods: [sui({ client, signer })],
    polyfill: false,
  });

  paidFetch = mppxClient.fetch;
});

describe('gateway e2e — 402 payment flow', () => {
  it('returns 402 with payment challenge on unauthenticated request', async () => {
    const res = await fetch(`${GATEWAY_URL}/openai/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Say hi' }],
      }),
    });

    expect(res.status).toBe(402);

    const wwwAuth = res.headers.get('www-authenticate');
    expect(wwwAuth).toBeTruthy();
    expect(wwwAuth).toContain('method="sui"');
  });

  it('completes payment and receives response — openai chat', async () => {
    const res = await paidFetch(`${GATEWAY_URL}/openai/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Say "hello e2e test" in exactly those words' }],
        max_tokens: 20,
      }),
    });

    expect(res.status).toBe(200);

    const receipt = res.headers.get('Payment-Receipt');
    expect(receipt).toBeTruthy();

    const data = await res.json();
    expect(data.choices).toBeDefined();
    expect(data.choices.length).toBeGreaterThan(0);
    expect(data.choices[0].message.content).toBeTruthy();
  });

  it('completes payment and receives response — brave search', async () => {
    const res = await paidFetch(`${GATEWAY_URL}/brave/v1/web/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: 'sui blockchain' }),
    });

    expect(res.status).toBe(200);

    const receipt = res.headers.get('Payment-Receipt');
    expect(receipt).toBeTruthy();

    const data = await res.json();
    expect(data.web?.results?.length).toBeGreaterThan(0);
  });

  it('receipt contains valid digest', async () => {
    const res = await paidFetch(`${GATEWAY_URL}/openai/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Say ok' }],
        max_tokens: 5,
      }),
    });

    expect(res.status).toBe(200);

    const receipt = res.headers.get('Payment-Receipt');
    expect(receipt).toBeTruthy();

    const decoded = JSON.parse(
      Buffer.from(receipt!.replace('sui:', ''), 'base64').toString(),
    );
    expect(decoded.reference).toBeTruthy();
    expect(decoded.reference.length).toBeGreaterThan(20);
    expect(decoded.status).toBe('success');
  });
});

describe('gateway e2e — error cases', () => {
  it('rejects invalid payment credential', async () => {
    const res = await fetch(`${GATEWAY_URL}/openai/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': 'Payment invalid_credential_data',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Say hi' }],
      }),
    });

    expect([402, 400]).toContain(res.status);
  });
});
