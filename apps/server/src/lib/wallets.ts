import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

function loadKeypair(envVar: string): Ed25519Keypair {
  const key = process.env[envVar];
  if (!key) throw new Error(`Missing env var: ${envVar}`);

  if (key.startsWith('suiprivkey')) {
    const decoded = decodeSuiPrivateKey(key);
    return Ed25519Keypair.fromSecretKey(decoded.secretKey);
  }
  const bytes = Buffer.from(key.replace(/^0x/, ''), 'hex');
  return Ed25519Keypair.fromSecretKey(bytes);
}

let _sponsorWallet: Ed25519Keypair | null = null;
let _gasStationWallet: Ed25519Keypair | null = null;
let _suiClient: SuiClient | null = null;

export function getSponsorWallet(): Ed25519Keypair {
  if (!_sponsorWallet) _sponsorWallet = loadKeypair('SPONSOR_PRIVATE_KEY');
  return _sponsorWallet;
}

export function getGasStationWallet(): Ed25519Keypair {
  if (!_gasStationWallet) _gasStationWallet = loadKeypair('GAS_STATION_PRIVATE_KEY');
  return _gasStationWallet;
}

export function getSuiClient(): SuiClient {
  if (!_suiClient) {
    const url = process.env.SUI_RPC_URL ?? getFullnodeUrl('mainnet');
    _suiClient = new SuiClient({ url });
  }
  return _suiClient;
}
