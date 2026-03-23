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
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 space-y-4">
      <p className="font-medium">{title}</p>

      <div className="space-y-2">
        {details.map((d) => (
          <div key={d.label} className="flex justify-between text-sm">
            <span className="text-neutral-400">{d.label}</span>
            <span className="text-white font-medium">{d.value}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-3 pt-1">
        <button
          onClick={onConfirm}
          disabled={loading}
          className="flex-1 rounded-xl bg-white py-3 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-200 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-400 border-t-neutral-950" />
              Processing...
            </>
          ) : (
            <>✓ {confirmLabel}</>
          )}
        </button>
        <button
          onClick={onCancel}
          disabled={loading}
          className="rounded-xl px-5 py-3 text-sm text-neutral-400 hover:text-white transition disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
