import { Receipt } from 'mppx';

export function parseReceiptDigest(header: string | null): string | null {
  if (!header) return null;
  try {
    const receipt = Receipt.deserialize(header);
    return receipt.reference ?? null;
  } catch {
    return null;
  }
}
