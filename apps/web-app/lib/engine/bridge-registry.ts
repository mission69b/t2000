import { PermissionBridge } from '@t2000/engine';

const bridges = new Map<string, PermissionBridge>();

const EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const expirations = new Map<string, number>();

function evictExpired(): void {
  const now = Date.now();
  for (const [sessionId, expiresAt] of expirations) {
    if (now > expiresAt) {
      const bridge = bridges.get(sessionId);
      bridge?.rejectAll();
      bridges.delete(sessionId);
      expirations.delete(sessionId);
    }
  }
}

export function getBridge(sessionId: string): PermissionBridge {
  evictExpired();
  let bridge = bridges.get(sessionId);
  if (!bridge) {
    bridge = new PermissionBridge();
    bridges.set(sessionId, bridge);
  }
  expirations.set(sessionId, Date.now() + EXPIRY_MS);
  return bridge;
}

export function resolveBridge(
  sessionId: string,
  permissionId: string,
  approved: boolean,
): boolean {
  const bridge = bridges.get(sessionId);
  if (!bridge) return false;
  return bridge.resolve(permissionId, approved);
}

export function cleanupBridge(sessionId: string): void {
  const bridge = bridges.get(sessionId);
  bridge?.rejectAll();
  bridges.delete(sessionId);
  expirations.delete(sessionId);
}
