import { createHash } from 'node:crypto';

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

export function solveHashcash(challenge: string): string {
  const bits = parseInt(challenge.split(':')[1], 10);
  let counter = 0;
  while (true) {
    const stamp = `${challenge}${counter.toString(16)}`;
    const hash = createHash('sha256').update(stamp).digest();
    if (hasLeadingZeroBits(hash, bits)) return stamp;
    counter++;
  }
}
