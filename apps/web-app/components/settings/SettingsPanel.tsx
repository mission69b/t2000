'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { truncateAddress } from '@/lib/format';
import type { Contact } from '@/hooks/useContacts';

interface SessionSummary {
  id: string;
  preview: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  address: string;
  email: string | null;
  network: string;
  sessionExpiresAt: number;
  contacts: Contact[];
  onRemoveContact: (address: string) => void;
  onSignOut: () => void;
  onRefreshSession: () => void;
  jwt?: string;
  activeSessionId?: string | null;
  onLoadSession?: (sessionId: string) => void;
  onNewConversation?: () => void;
}

const DEFAULT_LIMITS = { maxTx: 1000, maxDaily: 5000, agentBudget: 0.50 };

export function SettingsPanel({
  open,
  onClose,
  address,
  email,
  network,
  sessionExpiresAt,
  contacts,
  onRemoveContact,
  onSignOut,
  onRefreshSession,
  jwt,
  activeSessionId,
  onLoadSession,
  onNewConversation,
}: SettingsPanelProps) {
  const [copied, setCopied] = useState(false);
  const [showEmergencyConfirm, setShowEmergencyConfirm] = useState(false);
  const [limits, setLimits] = useState(DEFAULT_LIMITS);
  const [editingLimit, setEditingLimit] = useState<'maxTx' | 'maxDaily' | 'agentBudget' | null>(null);
  const [editValue, setEditValue] = useState('');
  const [now] = useState(() => Date.now());
  const [chatSessions, setChatSessions] = useState<SessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const loadSessions = useCallback(async () => {
    if (!address || !jwt) return;
    setSessionsLoading(true);
    try {
      const res = await fetch(`/api/engine/sessions?address=${address}&limit=10`, {
        headers: { 'x-zklogin-jwt': jwt },
      });
      if (res.ok) {
        const data = await res.json();
        setChatSessions(data.sessions ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setSessionsLoading(false);
    }
  }, [address, jwt]);

  useEffect(() => {
    if (open) loadSessions();
  }, [open, loadSessions]);

  useEffect(() => {
    if (!address) return;
    fetch(`/api/user/preferences?address=${address}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.limits && typeof data.limits === 'object') {
          setLimits({ ...DEFAULT_LIMITS, ...data.limits });
        }
      })
      .catch(() => {});
  }, [address]);

  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;
  const expiryDate = new Date(sessionExpiresAt);
  const daysLeft = Math.max(0, Math.ceil((sessionExpiresAt - now) / (24 * 60 * 60 * 1000)));

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} aria-hidden="true" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        className="fixed inset-y-0 right-0 w-full max-w-sm bg-background border-l border-border z-50 flex flex-col outline-none shadow-[var(--shadow-drawer)]"
      >
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 id="settings-title" className="text-lg font-semibold text-foreground">Settings</h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-lg p-2 text-muted hover:text-foreground hover:bg-surface transition"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Account */}
          <section className="space-y-3">
            <SectionHeader>Account</SectionHeader>
            <div className="space-y-2">
              {email && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted">&#9993;</span>
                  <span className="text-foreground">{email}</span>
                </div>
              )}
              <SettingRow label="Address" value={truncateAddress(address)} mono />
              <SettingRow label="Network" value={network} />
              <button
                onClick={handleCopy}
                className="text-sm text-foreground underline underline-offset-2 hover:opacity-70 transition font-mono"
              >
                {copied ? '\u2713 Copied' : 'Copy full address'}
              </button>
            </div>
          </section>

          {/* Session */}
          <section className="space-y-3">
            <SectionHeader>Session</SectionHeader>
            <div className="space-y-2">
              <SettingRow label="Expires" value={`${expiryDate.toLocaleDateString()} (${daysLeft}d left)`} />
              {daysLeft <= 1 && (
                <p className="text-xs text-warning">\u26A0 Session expiring soon</p>
              )}
              <button
                onClick={onRefreshSession}
                className="text-sm text-foreground underline underline-offset-2 hover:opacity-70 transition"
              >
                Refresh session
              </button>
            </div>
          </section>

          {/* Chat History */}
          {onLoadSession && (
            <section className="space-y-3">
              <SectionHeader>Chat History</SectionHeader>
              {onNewConversation && (
                <button
                  onClick={() => { onNewConversation(); onClose(); }}
                  className="w-full rounded-lg border border-border bg-background py-2 text-xs font-medium text-muted hover:text-foreground hover:border-border-bright transition"
                >
                  + New conversation
                </button>
              )}
              {sessionsLoading ? (
                <div className="space-y-2 animate-pulse">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-10 rounded-lg bg-surface" />
                  ))}
                </div>
              ) : chatSessions.length === 0 ? (
                <p className="text-sm text-muted">No previous conversations.</p>
              ) : (
                <div className="space-y-1">
                  {chatSessions.map((s) => {
                    const isActive = s.id === activeSessionId;
                    const timeAgo = formatTimeAgo(s.updatedAt);
                    return (
                      <button
                        key={s.id}
                        onClick={() => { onLoadSession(s.id); onClose(); }}
                        className={`w-full text-left rounded-lg px-2 py-2 -mx-2 transition group ${
                          isActive
                            ? 'bg-surface border border-border'
                            : 'hover:bg-surface'
                        }`}
                      >
                        <p className="text-sm text-foreground truncate">{s.preview}</p>
                        <p className="text-xs text-muted">
                          {s.messageCount} msgs \u00B7 {timeAgo}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Contacts */}
          <section className="space-y-3">
            <SectionHeader>Contacts</SectionHeader>
            {contacts.length === 0 ? (
              <p className="text-sm text-muted">No saved contacts yet. Send to an address and you&apos;ll be prompted to save it.</p>
            ) : (
              <div className="space-y-1">
                {contacts.map((c) => (
                  <div
                    key={c.address}
                    className="flex items-center justify-between py-2 px-2 -mx-2 rounded-lg hover:bg-surface transition group"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-foreground font-medium">{c.name}</p>
                      <p className="text-xs text-muted font-mono truncate">{truncateAddress(c.address)}</p>
                    </div>
                    <button
                      onClick={() => onRemoveContact(c.address)}
                      className="text-dim hover:text-error opacity-0 group-hover:opacity-100 transition p-1"
                      title="Remove contact"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Safety Limits */}
          <section className="space-y-3">
            <SectionHeader>Safety Limits</SectionHeader>
            <div className="space-y-2">
              <EditableLimit
                label="Max per transaction"
                value={limits.maxTx}
                editing={editingLimit === 'maxTx'}
                editValue={editValue}
                onEdit={() => { setEditingLimit('maxTx'); setEditValue(String(limits.maxTx)); }}
                onEditChange={setEditValue}
                onSave={() => {
                  const val = parseInt(editValue);
                  if (val > 0) {
                    const next = { ...limits, maxTx: val };
                    setLimits(next);
                    fetch('/api/user/preferences', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ address, limits: next }),
                    }).catch(() => {});
                  }
                  setEditingLimit(null);
                }}
                onCancel={() => setEditingLimit(null)}
              />
              <EditableLimit
                label="Max daily send"
                value={limits.maxDaily}
                editing={editingLimit === 'maxDaily'}
                editValue={editValue}
                onEdit={() => { setEditingLimit('maxDaily'); setEditValue(String(limits.maxDaily)); }}
                onEditChange={setEditValue}
                onSave={() => {
                  const val = parseInt(editValue);
                  if (val > 0) {
                    const next = { ...limits, maxDaily: val };
                    setLimits(next);
                    fetch('/api/user/preferences', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ address, limits: next }),
                    }).catch(() => {});
                  }
                  setEditingLimit(null);
                }}
                onCancel={() => setEditingLimit(null)}
              />
              <EditableLimit
                label="Agent session budget"
                value={limits.agentBudget}
                editing={editingLimit === 'agentBudget'}
                editValue={editValue}
                onEdit={() => { setEditingLimit('agentBudget'); setEditValue(String(limits.agentBudget)); }}
                onEditChange={setEditValue}
                onSave={() => {
                  const val = parseFloat(editValue);
                  if (val >= 0) {
                    const next = { ...limits, agentBudget: val };
                    setLimits(next);
                    fetch('/api/user/preferences', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ address, limits: next }),
                    }).catch(() => {});
                  }
                  setEditingLimit(null);
                }}
                onCancel={() => setEditingLimit(null)}
              />
              <p className="text-xs text-muted">Tap a limit to customize. Agent budget is the max auto-approved spend per session.</p>
            </div>
          </section>

          {/* Links */}
          <section className="space-y-3">
            <SectionHeader>Links</SectionHeader>
            <a
              href={`https://suiscan.xyz/${network}/account/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm text-info hover:underline transition"
            >
              View on Suiscan &#8599;
            </a>
          </section>

          {/* Emergency Lock */}
          <section className="space-y-3">
            <SectionHeader>Security</SectionHeader>
            {!showEmergencyConfirm ? (
              <button
                onClick={() => setShowEmergencyConfirm(true)}
                className="w-full rounded-lg border border-error/20 bg-error/5 py-2.5 text-sm font-medium text-error hover:bg-error/10 transition flex items-center justify-center gap-2"
              >
                <span className="w-2 h-2 bg-error rounded-full" />
                Emergency Lock
              </button>
            ) : (
              <div className="rounded-lg border border-error/30 bg-error/5 p-3 space-y-3">
                <p className="text-sm text-error">
                  This will sign you out and clear all local data. You can sign back in anytime with Google.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowEmergencyConfirm(false);
                      onSignOut();
                    }}
                    className="flex-1 rounded-lg bg-error/10 border border-error/30 py-2 text-sm font-medium text-error hover:bg-error/20 transition"
                  >
                    Confirm Lock
                  </button>
                  <button
                    onClick={() => setShowEmergencyConfirm(false)}
                    className="flex-1 rounded-lg border border-border py-2 text-sm text-muted hover:text-foreground transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="p-5 border-t border-border">
          <button
            onClick={onSignOut}
            className="w-full rounded-lg bg-surface border border-border py-3 text-sm font-medium text-muted hover:text-foreground hover:border-border-bright transition"
          >
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">{children}</h3>
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

function EditableLimit({
  label,
  value,
  editing,
  editValue,
  onEdit,
  onEditChange,
  onSave,
  onCancel,
}: {
  label: string;
  value: number;
  editing: boolean;
  editValue: string;
  onEdit: () => void;
  onEditChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  if (editing) {
    return (
      <div className="flex items-center justify-between text-sm gap-2">
        <span className="text-muted">{label}</span>
        <div className="flex items-center gap-1">
          <span className="text-muted">$</span>
          <input
            type="number"
            value={editValue}
            onChange={(e) => onEditChange(e.target.value)}
            autoFocus
            className="w-20 rounded-lg border border-border bg-surface px-2 py-1 text-sm text-foreground font-mono outline-none focus:border-border-bright"
            onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
          />
          <button onClick={onSave} className="text-foreground text-xs font-medium px-1">Save</button>
          <button onClick={onCancel} className="text-dim text-xs px-1">\u00D7</button>
        </div>
      </div>
    );
  }

  return (
    <button onClick={onEdit} className="flex justify-between text-sm w-full group">
      <span className="text-muted">{label}</span>
      <span className="text-foreground font-mono group-hover:opacity-70 transition">
        ${value.toLocaleString()}
        <span className="text-dim text-xs ml-1 opacity-0 group-hover:opacity-100 transition">\u270E</span>
      </span>
    </button>
  );
}
