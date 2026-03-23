'use client';

interface ResultCardProps {
  success: boolean;
  title: string;
  details: string;
  onDismiss: () => void;
}

export function ResultCard({ success, title, details, onDismiss }: ResultCardProps) {
  return (
    <div
      className={[
        'rounded-xl p-4 space-y-2',
        success ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20',
      ].join(' ')}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {success ? (
            <svg className="h-5 w-5 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="h-5 w-5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          )}
          <p className={`text-sm font-medium ${success ? 'text-green-400' : 'text-red-400'}`}>
            {title}
          </p>
        </div>
        <button onClick={onDismiss} className="text-neutral-500 hover:text-white p-1">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {details && (
        <p className="text-sm text-neutral-400 pl-7">{details}</p>
      )}
    </div>
  );
}
