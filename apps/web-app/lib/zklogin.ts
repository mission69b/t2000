import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
  generateNonce,
  generateRandomness,
  jwtToAddress,
  getExtendedEphemeralPublicKey,
} from '@mysten/sui/zklogin';
import { GOOGLE_CLIENT_ID, SUI_NETWORK } from './constants';

const STORAGE_KEY = 't2000:zklogin:session';
const PROVER_URL = 'https://prover.mystenlabs.com/v1';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

export interface ZkLoginSession {
  ephemeralKeyPair: string; // base64-encoded secret key
  maxEpoch: number;
  randomness: string;
  jwt: string;
  salt: string;
  proof: ZkProof;
  address: string;
  expiresAt: number; // unix ms — approximate expiry based on epoch duration
}

export interface ZkProof {
  proofPoints: {
    a: string[];
    b: string[][];
    c: string[];
  };
  issBase64Details: {
    indexMod4: number;
    value: string;
  };
  headerBase64: string;
  addressSeed: string;
}

export type ZkLoginStep = 'jwt' | 'salt' | 'proof' | 'done';

// --- Session persistence ---

export function saveSession(session: ZkLoginSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function loadSession(): ZkLoginSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ZkLoginSession;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function isSessionExpired(session: ZkLoginSession, currentEpoch: number): boolean {
  return currentEpoch >= session.maxEpoch;
}

// ~24 hours before maxEpoch is reached, we warn. Each epoch is ~24h on mainnet.
export function isSessionExpiringSoon(session: ZkLoginSession, currentEpoch: number): boolean {
  return session.maxEpoch - currentEpoch <= 1;
}

// --- Ephemeral key management ---

export function createEphemeralKeypair(): Ed25519Keypair {
  return new Ed25519Keypair();
}

export function serializeKeypair(kp: Ed25519Keypair): string {
  return kp.getSecretKey();
}

export function deserializeKeypair(secretKey: string): Ed25519Keypair {
  return Ed25519Keypair.fromSecretKey(secretKey);
}

// --- OAuth ---

export function getRedirectUrl(): string {
  return `${window.location.origin}/auth/callback`;
}

export function buildOAuthUrl(params: {
  nonce: string;
  redirectUri: string;
  clientId?: string;
}): string {
  const clientId = params.clientId || GOOGLE_CLIENT_ID;
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'id_token');
  url.searchParams.set('scope', 'openid');
  url.searchParams.set('nonce', params.nonce);
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

/**
 * Compute the nonce for the OAuth request.
 * maxEpoch determines session validity (~7 days = current + 7 on mainnet).
 */
export function computeNonce(
  ephemeralKeyPair: Ed25519Keypair,
  maxEpoch: number,
  randomness: string,
): string {
  return generateNonce(
    ephemeralKeyPair.getPublicKey(),
    maxEpoch,
    randomness,
  );
}

// --- JWT ---

export function extractJwtFromUrl(): string | null {
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  return params.get('id_token');
}

// --- Salt ---

export async function fetchSalt(jwt: string): Promise<string> {
  const res = await fetch('/api/zklogin/salt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jwt }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Salt service error: ${res.status}`);
  }

  const { salt } = await res.json();
  return salt;
}

// --- ZK Proof ---

export async function fetchZkProof(params: {
  jwt: string;
  ephemeralPublicKey: string;
  maxEpoch: number;
  randomness: string;
  salt: string;
}): Promise<ZkProof> {
  const res = await fetch(PROVER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jwt: params.jwt,
      extendedEphemeralPublicKey: params.ephemeralPublicKey,
      maxEpoch: params.maxEpoch,
      jwtRandomness: params.randomness,
      salt: params.salt,
      keyClaimName: 'sub',
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ZK prover error (${res.status}): ${body}`);
  }

  return res.json();
}

// --- Address ---

export function deriveAddress(jwt: string, salt: string): string {
  return jwtToAddress(jwt, BigInt(`0x${salt}`), false);
}

// --- Full flow helpers ---

/**
 * Start the OAuth login flow:
 * 1. Generate ephemeral keypair
 * 2. Get current epoch from Sui
 * 3. Compute nonce
 * 4. Redirect to Google
 */
export async function startLogin(getCurrentEpoch: () => Promise<number>): Promise<void> {
  const ephemeralKeyPair = createEphemeralKeypair();
  const randomness = generateRandomness();
  const currentEpoch = await getCurrentEpoch();
  const maxEpoch = currentEpoch + 7;

  const nonce = computeNonce(ephemeralKeyPair, maxEpoch, randomness);
  const redirectUri = getRedirectUrl();

  // Store pre-auth data so callback can reconstruct session
  sessionStorage.setItem(
    't2000:zklogin:pending',
    JSON.stringify({
      ephemeralKey: serializeKeypair(ephemeralKeyPair),
      maxEpoch,
      randomness,
    }),
  );

  window.location.href = buildOAuthUrl({ nonce, redirectUri });
}

/**
 * Retrieve pre-auth data stored before the OAuth redirect.
 */
export function getPendingAuth(): {
  ephemeralKey: string;
  maxEpoch: number;
  randomness: string;
} | null {
  try {
    const raw = sessionStorage.getItem('t2000:zklogin:pending');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearPendingAuth(): void {
  sessionStorage.removeItem('t2000:zklogin:pending');
}

/**
 * Complete the login flow after Google redirects back:
 * 1. Extract JWT from URL
 * 2. Fetch salt from our server
 * 3. Generate ZK proof via Mysten prover
 * 4. Derive address
 * 5. Save session
 *
 * Calls onStep('jwt' | 'salt' | 'proof' | 'done') to drive the loading screen.
 */
export async function completeLogin(params: {
  onStep: (step: ZkLoginStep) => void;
}): Promise<ZkLoginSession> {
  const jwt = extractJwtFromUrl();
  if (!jwt) throw new Error('No JWT found in callback URL');

  const pending = getPendingAuth();
  if (!pending) throw new Error('No pending auth data — did you start login first?');

  params.onStep('jwt');

  const ephemeralKeyPair = deserializeKeypair(pending.ephemeralKey);
  const extPubKey = getExtendedEphemeralPublicKey(ephemeralKeyPair.getPublicKey());

  // Fetch salt
  const salt = await fetchSalt(jwt);
  params.onStep('salt');

  // Derive address
  const address = deriveAddress(jwt, salt);

  // Generate ZK proof (3-8 seconds)
  const proof = await fetchZkProof({
    jwt,
    ephemeralPublicKey: extPubKey,
    maxEpoch: pending.maxEpoch,
    randomness: pending.randomness,
    salt,
  });
  params.onStep('proof');

  // Estimate expiry: each epoch ~24h on mainnet, ~2h on testnet
  const epochDurationMs = SUI_NETWORK === 'mainnet' ? 24 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000;
  const epochsRemaining = 7;
  const expiresAt = Date.now() + epochsRemaining * epochDurationMs;

  const session: ZkLoginSession = {
    ephemeralKeyPair: pending.ephemeralKey,
    maxEpoch: pending.maxEpoch,
    randomness: pending.randomness,
    jwt,
    salt,
    proof,
    address,
    expiresAt,
  };

  saveSession(session);
  clearPendingAuth();
  params.onStep('done');

  return session;
}
