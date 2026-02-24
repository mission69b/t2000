import { createHash, randomBytes } from 'node:crypto';

const DIFFICULTY = 20; // 20 leading zero bits (~1M hashes, ~1-2 seconds)

export interface HashcashChallenge {
  resource: string;
  bits: number;
  date: string;
  rand: string;
}

export interface HashcashSolution {
  stamp: string;
}

export function createChallenge(agentAddress: string): HashcashChallenge {
  return {
    resource: agentAddress,
    bits: DIFFICULTY,
    date: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
    rand: randomBytes(8).toString('hex'),
  };
}

export function formatChallenge(c: HashcashChallenge): string {
  return `1:${c.bits}:${c.date}:${c.resource}::${c.rand}:`;
}

export function verifyStamp(stamp: string, expectedResource: string): boolean {
  const parts = stamp.split(':');
  if (parts.length < 7) return false;

  const [ver, bitsStr, date, resource] = parts;
  if (ver !== '1') return false;

  const bits = parseInt(bitsStr, 10);
  if (bits < DIFFICULTY) return false;

  if (resource !== expectedResource) return false;

  const dateStr = date;
  const now = new Date();
  const stampDate = new Date(`${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`);
  const diffMs = now.getTime() - stampDate.getTime();
  if (diffMs < 0 || diffMs > 24 * 60 * 60 * 1000) return false;

  const hash = createHash('sha256').update(stamp).digest();
  return hasLeadingZeroBits(hash, bits);
}

function hasLeadingZeroBits(hash: Buffer, bits: number): boolean {
  const fullBytes = Math.floor(bits / 8);
  const remainingBits = bits % 8;

  for (let i = 0; i < fullBytes; i++) {
    if (hash[i] !== 0) return false;
  }

  if (remainingBits > 0) {
    const mask = 0xff << (8 - remainingBits);
    if ((hash[fullBytes] & mask) !== 0) return false;
  }

  return true;
}

// SDK-side: solve a hashcash challenge
export function solveChallenge(challenge: string): string {
  let counter = 0;
  while (true) {
    const stamp = `${challenge}${counter.toString(16)}`;
    const hash = createHash('sha256').update(stamp).digest();
    const bits = parseInt(challenge.split(':')[1], 10);
    if (hasLeadingZeroBits(hash, bits)) return stamp;
    counter++;
  }
}
