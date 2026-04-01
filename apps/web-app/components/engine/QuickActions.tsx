'use client';

interface QuickAction {
  label: string;
  prompt: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Check balance', prompt: 'What is my current balance?' },
  { label: 'View rates', prompt: 'What are the current savings rates?' },
  { label: 'Account health', prompt: 'How is my account health?' },
  { label: 'Savings info', prompt: 'Show me my savings details' },
];

interface QuickActionsProps {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

export function QuickActions({ onSelect, disabled }: QuickActionsProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Quick actions">
      {QUICK_ACTIONS.map((action) => (
        <button
          key={action.label}
          onClick={() => onSelect(action.prompt)}
          disabled={disabled}
          className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted hover:border-border-bright hover:text-foreground transition disabled:opacity-50 disabled:pointer-events-none"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
