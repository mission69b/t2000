'use client';

import { truncateAddress } from '@/lib/format';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  address: string;
  network: string;
  sessionExpiresAt: number;
  onSignOut: () => void;
  onRefreshSession: () => void;
}

export function SettingsPanel({
  open,
  onClose,
  address,
  network,
  sessionExpiresAt,
  onSignOut,
  onRefreshSession,
}: SettingsPanelProps) {
  if (!open) return null;

  const expiryDate = new Date(sessionExpiresAt);
  const daysLeft = Math.max(0, Math.ceil((sessionExpiresAt - Date.now()) / (24 * 60 * 60 * 1000)));

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-background border-l border-border z-50 flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Settings</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted hover:text-foreground hover:bg-panel transition"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">Account</h3>
            <div className="space-y-2">
              <SettingRow label="Address" value={truncateAddress(address)} mono />
              <SettingRow label="Network" value={network} />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(address);
                }}
                className="text-sm text-accent hover:underline transition"
              >
                Copy full address
              </button>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">Session</h3>
            <div className="space-y-2">
              <SettingRow label="Expires" value={`${expiryDate.toLocaleDateString()} (${daysLeft}d left)`} />
              <button
                onClick={onRefreshSession}
                className="text-sm text-accent hover:underline underline-offset-2 transition"
              >
                Refresh session
              </button>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">Links</h3>
            <a
              href={`https://suiscan.xyz/${network}/account/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm text-accent hover:underline transition"
            >
              View on Suiscan ↗
            </a>
          </section>
        </div>

        <div className="p-5 border-t border-border">
          <button
            onClick={onSignOut}
            className="w-full rounded-xl bg-red-500/10 border border-red-500/20 py-3 text-sm font-medium text-red-400 hover:bg-red-500/20 transition"
          >
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}

function SettingRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted">{label}</span>
      <span className={`text-foreground ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
