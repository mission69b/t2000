'use client';

interface ConfirmationCardProps {
  title: string;
  details: { label: string; value: string }[];
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ConfirmationCard({
  title,
  details,
  confirmLabel,
  onConfirm,
  onCancel,
  loading,
}: ConfirmationCardProps) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 space-y-4 feed-row">
      <p className="font-medium text-foreground">{title}</p>

      <div className="space-y-2">
        {details.map((d) => (
          <div key={d.label} className="flex justify-between text-sm">
            <span className="text-muted">{d.label}</span>
            <span className="text-foreground font-medium font-mono">{d.value}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-3 pt-1">
        <button
          onClick={onConfirm}
          disabled={loading}
          className="flex-1 rounded-xl bg-accent py-3 text-sm font-semibold text-background transition hover:bg-accent/90 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-background/40 border-t-background" />
              Processing...
            </>
          ) : (
            <>✓ {confirmLabel}</>
          )}
        </button>
        <button
          onClick={onCancel}
          disabled={loading}
          className="rounded-xl px-5 py-3 text-sm text-muted hover:text-foreground transition disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
