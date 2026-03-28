'use client';

import { useCallback, useRef, useState } from 'react';
import { useAgent, ServiceDeliveryError, type ServiceResult } from '@/hooks/useAgent';
import { TOOL_EXECUTORS, getEstimatedCost, type ToolCall, type NormalizedResponse } from '@/lib/agent-tools';

const MAX_ITERATIONS = 10;
const MAX_RESULT_SIZE = 4000;
const MAX_HISTORY = 20;

function isMediaResult(result: unknown): { type: 'image' | 'audio'; dataUri: string } | null {
  if (
    typeof result === 'object' && result !== null &&
    'type' in result && 'dataUri' in result &&
    typeof (result as { dataUri: unknown }).dataUri === 'string'
  ) {
    const r = result as { type: string; dataUri: string };
    if ((r.type === 'image' || r.type === 'audio') && r.dataUri.startsWith('data:')) {
      return { type: r.type, dataUri: r.dataUri };
    }
  }
  if (
    typeof result === 'object' && result !== null &&
    'images' in result && Array.isArray((result as { images: unknown }).images)
  ) {
    const images = (result as { images: { url?: string }[] }).images;
    if (images[0]?.url) {
      return { type: 'image', dataUri: images[0].url };
    }
  }
  return null;
}

function trimMessages(msgs: ChatMessage[]): ChatMessage[] {
  if (msgs.length <= MAX_HISTORY) return msgs;
  let trimmed = msgs.slice(-MAX_HISTORY);
  while (
    trimmed.length > 0 &&
    (trimmed[0].role === 'tool' ||
      (trimmed[0].role === 'assistant' && trimmed[0].tool_calls?.length))
  ) {
    trimmed = trimmed.slice(1);
  }
  return trimmed;
}

export interface AgentStep {
  tool: string;
  status: 'running' | 'done' | 'error';
  cost?: number;
  error?: string;
}

export type AgentStatus = 'idle' | 'running' | 'confirming';

interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface MediaResult {
  type: 'image' | 'audio';
  dataUri: string;
  tool: string;
  cost?: number;
}

export interface AgentCallbacks {
  onStep: (step: AgentStep) => void;
  onStepUpdate: (tool: string, step: Partial<AgentStep>) => void;
  onText: (text: string) => void;
  onMedia: (media: MediaResult) => void;
  onConfirmNeeded: (tool: string, args: Record<string, unknown>, cost: number) => Promise<boolean>;
  onDone: (totalCost: number) => void;
  onError: (error: string) => void;
}

export function useAgentLoop() {
  const { agent } = useAgent();
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [totalCost, setTotalCost] = useState(0);

  const conversationRef = useRef<ChatMessage[]>([]);
  const cancelledRef = useRef(false);

  const run = useCallback(async (
    message: string,
    opts: {
      address: string;
      email: string;
      balanceSummary?: string;
      budget: number;
      locale?: string;
    },
    callbacks: AgentCallbacks,
  ) => {
    if (!agent) {
      callbacks.onError('Not authenticated');
      return;
    }

    setStatus('running');
    cancelledRef.current = false;
    let cost = 0;
    let iterations = 0;
    let emptyRetries = 0;
    const toolCallCounts = new Map<string, number>();

    conversationRef.current = trimMessages(conversationRef.current);
    conversationRef.current.push({ role: 'user', content: message });

    while (iterations < MAX_ITERATIONS && !cancelledRef.current) {
      iterations++;

      let llmResponse: NormalizedResponse;
      try {
        const res = await fetch('/api/agent/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: conversationRef.current,
            address: opts.address,
            email: opts.email,
            balanceSummary: opts.balanceSummary,
            locale: opts.locale,
          }),
        });

        if (!res.ok) {
          throw new Error(`Agent API error: ${res.status}`);
        }

        llmResponse = await res.json();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to reach agent';
        callbacks.onError(msg);
        break;
      }

      if (llmResponse.content && !llmResponse.tool_calls?.length) {
        conversationRef.current.push({ role: 'assistant', content: llmResponse.content });
        callbacks.onText(llmResponse.content);
        callbacks.onDone(cost);
        break;
      }

      if (llmResponse.tool_calls?.length) {
        conversationRef.current.push({
          role: 'assistant',
          content: llmResponse.content,
          tool_calls: llmResponse.tool_calls,
        });

        for (const toolCall of llmResponse.tool_calls) {
          const callKey = `${toolCall.function.name}:${toolCall.function.arguments}`;
          const prevCount = toolCallCounts.get(callKey) ?? 0;
          toolCallCounts.set(callKey, prevCount + 1);

          if (prevCount >= 3) {
            conversationRef.current.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: 'This tool was already called with identical arguments. Try a different approach.' }),
            });
            continue;
          }
          if (cancelledRef.current) break;

          const executor = TOOL_EXECUTORS[toolCall.function.name];
          if (!executor) {
            conversationRef.current.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: `Unknown tool: ${toolCall.function.name}` }),
            });
            continue;
          }

          const args = JSON.parse(toolCall.function.arguments);
          let result: unknown;

          if (executor.type === 'read') {
            callbacks.onStep({ tool: toolCall.function.name, status: 'running' });
            try {
              const res = await fetch('/api/agent/tool', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  tool: toolCall.function.name,
                  args,
                  address: opts.address,
                }),
              });
              result = await res.json();
              callbacks.onStepUpdate(toolCall.function.name, { status: 'done', cost: 0 });
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : 'Read tool failed';
              result = { error: errMsg };
              callbacks.onStepUpdate(toolCall.function.name, { status: 'error', error: errMsg });
            }
          } else if (executor.type === 'service') {
            const estimated = getEstimatedCost(toolCall.function.name, args);

            if (estimated > 0.50 || cost + estimated > opts.budget) {
              setStatus('confirming');
              const approved = await callbacks.onConfirmNeeded(
                toolCall.function.name,
                args,
                estimated,
              );
              setStatus('running');

              if (!approved) {
                cancelledRef.current = true;
                conversationRef.current.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: JSON.stringify({ error: 'User declined this action' }),
                });
                break;
              }
            }

            callbacks.onStep({ tool: toolCall.function.name, status: 'running', cost: estimated });

            try {
              const fields = executor.transform!(args);
              const sdk = await agent.getInstance();
              let serviceResult: ServiceResult;

              try {
                serviceResult = await sdk.payService({
                  serviceId: executor.serviceId!,
                  fields,
                });
              } catch (payErr) {
                if (payErr instanceof ServiceDeliveryError) {
                  for (let retry = 0; retry < 2; retry++) {
                    try {
                      serviceResult = await sdk.retryServiceDelivery(payErr.paymentDigest, payErr.meta);
                      break;
                    } catch (retryErr) {
                      if (retry === 1 || !(retryErr instanceof ServiceDeliveryError)) throw retryErr;
                    }
                  }
                  if (!serviceResult!) throw payErr;
                } else {
                  throw payErr;
                }
              }

              result = serviceResult.result;
              const actualCost = parseFloat(serviceResult.price);
              cost += actualCost;
              setTotalCost(cost);
              callbacks.onStepUpdate(toolCall.function.name, {
                status: 'done',
                cost: actualCost,
              });
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : 'Service call failed';
              result = { error: errMsg };
              callbacks.onStepUpdate(toolCall.function.name, { status: 'error', error: errMsg });
            }
          } else if (executor.type === 'raw-service') {
            const estimated = args.maxPrice ? Number(args.maxPrice) : (executor.estimatedCost ?? 0.05);

            if (estimated > 0.50 || cost + estimated > opts.budget) {
              setStatus('confirming');
              const approved = await callbacks.onConfirmNeeded(
                toolCall.function.name,
                args,
                estimated,
              );
              setStatus('running');

              if (!approved) {
                cancelledRef.current = true;
                conversationRef.current.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: JSON.stringify({ error: 'User declined this action' }),
                });
                break;
              }
            }

            callbacks.onStep({ tool: toolCall.function.name, status: 'running', cost: estimated });

            try {
              let rawBody: Record<string, unknown> = {};
              try { rawBody = JSON.parse(String(args.body ?? '{}')); } catch { /* use empty */ }

              const sdk = await agent.getInstance();
              let serviceResult: ServiceResult;

              try {
                serviceResult = await sdk.payService({
                  url: String(args.url),
                  rawBody,
                });
              } catch (payErr) {
                if (payErr instanceof ServiceDeliveryError) {
                  for (let retry = 0; retry < 2; retry++) {
                    try {
                      serviceResult = await sdk.retryServiceDelivery(payErr.paymentDigest, payErr.meta);
                      break;
                    } catch (retryErr) {
                      if (retry === 1 || !(retryErr instanceof ServiceDeliveryError)) throw retryErr;
                    }
                  }
                  if (!serviceResult!) throw payErr;
                } else {
                  throw payErr;
                }
              }

              result = serviceResult.result;
              const actualCost = parseFloat(serviceResult.price);
              cost += actualCost;
              setTotalCost(cost);
              callbacks.onStepUpdate(toolCall.function.name, {
                status: 'done',
                cost: actualCost,
              });
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : 'Service call failed';
              result = { error: errMsg };
              callbacks.onStepUpdate(toolCall.function.name, { status: 'error', error: errMsg });
            }
          }

          const media = isMediaResult(result);
          if (media) {
            callbacks.onMedia({ ...media, tool: toolCall.function.name });
            conversationRef.current.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ type: media.type, delivered: true, message: `${media.type === 'image' ? 'Image' : 'Audio'} generated and displayed to user.` }),
            });
          } else {
            const resultStr = JSON.stringify(result);
            const truncated = resultStr.length > MAX_RESULT_SIZE
              ? resultStr.slice(0, MAX_RESULT_SIZE) + '…[truncated]'
              : resultStr;

            conversationRef.current.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: truncated,
            });
          }
        }
      }

      if (!llmResponse.tool_calls?.length && !llmResponse.content) {
        if (emptyRetries < 1) {
          emptyRetries++;
          continue;
        }
        callbacks.onError('Agent returned an empty response. Try rephrasing your request.');
        callbacks.onDone(cost);
        break;
      }
    }

    if (cancelledRef.current) {
      callbacks.onDone(cost);
    } else if (iterations >= MAX_ITERATIONS) {
      callbacks.onError(`Task too complex — stopped after ${MAX_ITERATIONS} steps. Try breaking it into smaller requests.`);
      callbacks.onDone(cost);
    }

    setStatus('idle');
  }, [agent]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    setStatus('idle');
  }, []);

  const clearHistory = useCallback(() => {
    conversationRef.current = [];
    setTotalCost(0);
  }, []);

  const trimHistory = useCallback(() => {
    conversationRef.current = trimMessages(conversationRef.current);
  }, []);

  return { run, cancel, clearHistory, trimHistory, status, totalCost };
}
