import type { T2000 } from '@t2000/sdk';
import type { LLMProvider, ChatMessage, ToolCall, ToolDefinition } from './llm/types.js';
import type { GatewayTool } from './tools.js';
import { getDryRunHandler } from './tools.js';
import { ContextManager } from './context.js';
import { buildSystemPrompt, buildContextInjection } from './system-prompt.js';

const CONFIRMATION_TIMEOUT_MS = 2 * 60 * 1000;

export interface AgentLoopOptions {
  agent: T2000;
  llm: LLMProvider;
  tools: GatewayTool[];
  toolDefinitions: ToolDefinition[];
}

export interface AgentResponse {
  text: string;
  toolCalls: ToolCallRecord[];
  needsConfirmation?: PendingConfirmation;
  usage: { inputTokens: number; outputTokens: number };
}

export interface ToolCallRecord {
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
  dryRun: boolean;
}

export interface PendingConfirmation {
  tool: GatewayTool;
  args: Record<string, unknown>;
  preview: unknown;
  createdAt: number;
}

export class AgentLoop {
  private agent: T2000;
  private llm: LLMProvider;
  private tools: Map<string, GatewayTool>;
  private toolDefinitions: ToolDefinition[];
  private context: ContextManager;
  private systemPrompt: string;
  private pendingConfirmation: PendingConfirmation | null = null;
  private executionLock = false;
  private totalUsage = { inputTokens: 0, outputTokens: 0 };

  constructor(options: AgentLoopOptions) {
    this.agent = options.agent;
    this.llm = options.llm;
    this.tools = new Map(options.tools.map(t => [t.name, t]));
    this.toolDefinitions = options.toolDefinitions;
    this.context = new ContextManager();
    this.systemPrompt = buildSystemPrompt(options.tools.length);
  }

  async processMessage(
    userMessage: string,
    options?: { stream?: boolean; onToken?: (token: string) => void },
  ): Promise<AgentResponse> {
    while (this.executionLock) {
      await new Promise(r => setTimeout(r, 100));
    }
    this.executionLock = true;

    try {
      return await this._processMessage(userMessage, options);
    } finally {
      this.executionLock = false;
    }
  }

  private async _processMessage(
    userMessage: string,
    options?: { stream?: boolean; onToken?: (token: string) => void },
  ): Promise<AgentResponse> {
    const allToolCalls: ToolCallRecord[] = [];
    const totalUsage = { inputTokens: 0, outputTokens: 0 };

    // Handle confirmation response
    if (this.pendingConfirmation) {
      const lower = userMessage.toLowerCase().trim();
      const isConfirm = ['yes', 'y', 'do it', 'go ahead', 'proceed', 'confirm', 'ok', 'sure'].includes(lower);
      const isCancel = ['no', 'n', 'cancel', 'nah', 'nevermind', 'stop'].includes(lower);

      if (isConfirm || isCancel) {
        const pending = this.pendingConfirmation;
        this.pendingConfirmation = null;

        if (Date.now() - pending.createdAt > CONFIRMATION_TIMEOUT_MS) {
          const text = "That action has expired (2 min timeout). Want me to try again?";
          this.context.addMessage({ role: 'user', content: userMessage });
          this.context.addMessage({ role: 'assistant', content: text });
          return { text, toolCalls: allToolCalls, usage: totalUsage };
        }

        if (isCancel) {
          const text = "Cancelled.";
          this.context.addMessage({ role: 'user', content: userMessage });
          this.context.addMessage({ role: 'assistant', content: text });
          return { text, toolCalls: allToolCalls, usage: totalUsage };
        }

        // Execute for real
        try {
          const result = await pending.tool.handler(this.agent, pending.args);
          allToolCalls.push({ name: pending.tool.name, arguments: pending.args, result, dryRun: false });

          // Feed result to LLM for a human-friendly response
          this.context.addMessage({ role: 'user', content: userMessage });
          const toolCallId = `exec_${Date.now()}`;
          this.context.addMessage({
            role: 'assistant', content: '',
            toolCalls: [{ id: toolCallId, name: pending.tool.name, arguments: pending.args }],
          });
          this.context.addMessage({
            role: 'tool', content: JSON.stringify(result), toolCallId,
          });

          const response = await this.callLLM(options);
          totalUsage.inputTokens += response.usage?.inputTokens ?? 0;
          totalUsage.outputTokens += response.usage?.outputTokens ?? 0;
          const text = response.text ?? 'Done.';
          this.context.addMessage({ role: 'assistant', content: text });
          return { text, toolCalls: allToolCalls, usage: totalUsage };
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          const text = `Transaction failed: ${errorMsg}`;
          this.context.addMessage({ role: 'user', content: userMessage });
          this.context.addMessage({ role: 'assistant', content: text });
          return { text, toolCalls: allToolCalls, usage: totalUsage };
        }
      }
      // Not a confirmation response — treat as new message, drop pending
      this.pendingConfirmation = null;
    }

    // Inject fresh context
    const contextData = await buildContextInjection(this.agent);
    this.context.addMessage({ role: 'user', content: userMessage });

    // Add context injection as a system-level hint
    const contextMsg: ChatMessage = {
      role: 'user',
      content: `[System context — do not repeat this to the user]\n${contextData}`,
    };

    const MAX_ITERATIONS = 10;
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const messages = this.buildMessages(i === 0 ? contextMsg : undefined);
      const response = await this.llm.chat({
        messages,
        tools: this.toolDefinitions,
        stream: options?.stream,
        onToken: options?.onToken,
      });

      totalUsage.inputTokens += response.usage?.inputTokens ?? 0;
      totalUsage.outputTokens += response.usage?.outputTokens ?? 0;

      // Text-only response — we're done
      if (!response.toolCalls?.length) {
        const text = response.text ?? '';
        this.context.addMessage({ role: 'assistant', content: text });
        this.trackUsage(totalUsage);
        return { text, toolCalls: allToolCalls, usage: totalUsage };
      }

      // Process tool calls
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: response.text ?? '',
        toolCalls: response.toolCalls,
      };
      this.context.addMessage(assistantMsg);

      for (const tc of response.toolCalls) {
        const tool = this.tools.get(tc.name);
        if (!tool) {
          this.context.addMessage({
            role: 'tool', content: JSON.stringify({ error: `Unknown tool: ${tc.name}` }),
            toolCallId: tc.id,
          });
          continue;
        }

        if (tool.stateChanging) {
          // Run dryRun first
          const dryRunHandler = getDryRunHandler(tool);
          let preview: unknown;
          try {
            preview = dryRunHandler
              ? await dryRunHandler(this.agent, tc.arguments)
              : { preview: true, action: tc.name, args: tc.arguments };
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            this.context.addMessage({
              role: 'tool', content: JSON.stringify({ error: errorMsg }),
              toolCallId: tc.id,
            });
            continue;
          }

          allToolCalls.push({ name: tc.name, arguments: tc.arguments, result: preview, dryRun: true });

          // Feed preview back to LLM so it can present it to the user
          this.context.addMessage({
            role: 'tool',
            content: JSON.stringify({ dryRun: true, preview, note: 'Present this preview to the user and ask for confirmation.' }),
            toolCallId: tc.id,
          });

          // Store pending confirmation
          this.pendingConfirmation = {
            tool,
            args: tc.arguments,
            preview,
            createdAt: Date.now(),
          };
        } else {
          // Read-only — execute immediately
          try {
            const result = await tool.handler(this.agent, tc.arguments);
            allToolCalls.push({ name: tc.name, arguments: tc.arguments, result, dryRun: false });
            this.context.addMessage({
              role: 'tool', content: this.truncateResult(result), toolCallId: tc.id,
            });
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            this.context.addMessage({
              role: 'tool', content: JSON.stringify({ error: errorMsg }),
              toolCallId: tc.id,
            });
          }
        }
      }

      // If we have a pending confirmation, get the LLM to present the preview
      if (this.pendingConfirmation) {
        const confirmResponse = await this.callLLM(options);
        totalUsage.inputTokens += confirmResponse.usage?.inputTokens ?? 0;
        totalUsage.outputTokens += confirmResponse.usage?.outputTokens ?? 0;
        const text = confirmResponse.text ?? 'Shall I proceed?';
        this.context.addMessage({ role: 'assistant', content: text });
        this.trackUsage(totalUsage);
        return { text, toolCalls: allToolCalls, needsConfirmation: this.pendingConfirmation, usage: totalUsage };
      }

      // Continue the loop if LLM might want to call more tools
    }

    const text = "I've reached my processing limit. Please try again with a simpler request.";
    this.context.addMessage({ role: 'assistant', content: text });
    this.trackUsage(totalUsage);
    return { text, toolCalls: allToolCalls, usage: totalUsage };
  }

  private buildMessages(contextInjection?: ChatMessage): ChatMessage[] {
    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
    ];
    if (contextInjection) messages.push(contextInjection);
    messages.push(...this.context.getHistory());
    return messages;
  }

  private async callLLM(
    options?: { stream?: boolean; onToken?: (token: string) => void },
  ) {
    return this.llm.chat({
      messages: this.buildMessages(),
      tools: this.toolDefinitions,
      stream: options?.stream,
      onToken: options?.onToken,
    });
  }

  private trackUsage(usage: { inputTokens: number; outputTokens: number }): void {
    this.totalUsage.inputTokens += usage.inputTokens;
    this.totalUsage.outputTokens += usage.outputTokens;
  }

  getTotalUsage() {
    return { ...this.totalUsage };
  }

  hasPendingConfirmation(): boolean {
    if (!this.pendingConfirmation) return false;
    if (Date.now() - this.pendingConfirmation.createdAt > CONFIRMATION_TIMEOUT_MS) {
      this.pendingConfirmation = null;
      return false;
    }
    return true;
  }

  clearHistory(): void {
    this.context.clear();
    this.pendingConfirmation = null;
  }

  private truncateResult(result: unknown, maxLen = 2000): string {
    const json = JSON.stringify(result);
    if (json.length <= maxLen) return json;
    return json.slice(0, maxLen) + '...[truncated]';
  }
}
