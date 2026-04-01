import type { SSEEvent } from '@t2000/engine';

export type { SSEEvent };

export interface EngineChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  tools?: ToolExecution[];
  permission?: PendingPermission;
  usage?: UsageData;
  isStreaming?: boolean;
}

export interface ToolExecution {
  toolName: string;
  toolUseId: string;
  input: unknown;
  status: 'running' | 'done' | 'error';
  result?: unknown;
  isError?: boolean;
}

export interface PendingPermission {
  permissionId: string;
  toolName: string;
  toolUseId: string;
  input: unknown;
  description: string;
  status: 'pending' | 'approved' | 'denied';
}

export interface UsageData {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export type EngineStatus = 'idle' | 'connecting' | 'streaming' | 'error';
