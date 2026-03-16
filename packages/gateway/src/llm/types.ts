export interface LLMProvider {
  readonly id: string;
  readonly model: string;

  chat(params: ChatParams): Promise<LLMResponse>;
}

export interface ChatParams {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  stream?: boolean;
  onToken?: (token: string) => void;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface LLMResponse {
  text?: string;
  toolCalls?: ToolCall[];
  usage?: { inputTokens: number; outputTokens: number };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
