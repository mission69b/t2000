'use client';

import type { ToolExecution } from '@/lib/engine-types';

const TOOL_LABELS: Record<string, string> = {
  balance_check: 'Checking balance',
  savings_info: 'Checking savings',
  health_check: 'Checking health',
  rates_info: 'Checking rates',
  transaction_history: 'Loading history',
  save_deposit: 'Depositing savings',
  withdraw: 'Withdrawing',
  send_transfer: 'Sending transfer',
  borrow: 'Borrowing',
  repay_debt: 'Repaying debt',
  claim_rewards: 'Claiming rewards',
  pay_api: 'Calling API',
};

interface ToolCardProps {
  tool: ToolExecution;
}

export function ToolCard({ tool }: ToolCardProps) {
  const label = TOOL_LABELS[tool.toolName] ?? tool.toolName.replace(/_/g, ' ');

  const statusText = tool.status === 'running' ? 'in progress' : tool.status;

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted"
      role="status"
      aria-label={`${label}: ${statusText}`}
    >
      {tool.status === 'running' && (
        <span className="h-3 w-3 shrink-0 animate-spin rounded-full border border-border-bright border-t-foreground" aria-hidden="true" />
      )}
      {tool.status === 'done' && (
        <span className="text-success shrink-0" aria-hidden="true">&#10003;</span>
      )}
      {tool.status === 'error' && (
        <span className="text-error shrink-0" aria-hidden="true">&#10007;</span>
      )}
      <span className="truncate">{label}</span>
    </span>
  );
}
