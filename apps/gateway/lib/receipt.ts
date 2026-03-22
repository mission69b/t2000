export function parseReceiptDigest(receipt: string | null): string | null {
  if (!receipt) return null;
  try {
    const parsed = JSON.parse(Buffer.from(receipt, 'base64').toString());
    return parsed.digest ?? parsed.txDigest ?? null;
  } catch {
    if (/^[A-Za-z0-9+/=]{43,44}$/.test(receipt)) return receipt;
    return null;
  }
}
