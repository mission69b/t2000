/**
 * Conversation State Machine — F4 of the Intelligence Layer.
 *
 * Types, pure context builder, and a generic state manager interface.
 * The Redis implementation lives in the host app (audric) since it depends on @upstash/redis.
 */

// ---------------------------------------------------------------------------
// State definitions
// ---------------------------------------------------------------------------

export type ConversationState =
  | { type: 'idle' }

  | {
      type: 'mid_recipe';
      recipeName: string;
      currentStep: number;
      totalSteps: number;
      completedStepOutputs: Record<string, Record<string, string | number>>;
      startedAt: number;
    }

  | {
      type: 'awaiting_confirmation';
      action: string;
      amount?: number;
      recipient?: string;
      proposedAt: number;
      expiresAt: number;
    }

  | {
      type: 'post_error';
      failedAction: string;
      errorMessage: string;
      occurredAt: number;
      partialState?: string;
    }

  | {
      type: 'post_liquidation_warning';
      healthFactor: number;
      warnedAt: number;
    }

  | {
      type: 'onboarding';
      sessionNumber: number;
      hasBalance: boolean;
      hasSavedBefore: boolean;
    };

export type StateType = ConversationState['type'];

// ---------------------------------------------------------------------------
// State manager interface (host app provides the implementation)
// ---------------------------------------------------------------------------

export interface ConversationStateStore {
  get(): Promise<ConversationState>;
  set(state: ConversationState): Promise<void>;
  transition(to: ConversationState): Promise<void>;
  reset(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Context builder — pure function, no I/O
// ---------------------------------------------------------------------------

export function buildStateContext(state: ConversationState): string {
  switch (state.type) {
    case 'idle':
      return '';

    case 'mid_recipe': {
      const elapsed = Math.round((Date.now() - state.startedAt) / 60_000);
      const outputs = JSON.stringify(state.completedStepOutputs);
      return [
        `Conversation state: MID-RECIPE`,
        `Active recipe: ${state.recipeName} (step ${state.currentStep + 1} of ${state.totalSteps})`,
        `Started: ${elapsed} minutes ago`,
        `Completed step key outputs: ${outputs}`,
        `If the user asks an unrelated question: answer briefly, then offer to continue the ${state.recipeName} flow.`,
        `If the user says "cancel" or "stop": confirm you have abandoned the recipe and return to idle.`,
      ].join('\n');
    }

    case 'awaiting_confirmation': {
      const expiryMins = Math.max(0, Math.round((state.expiresAt - Date.now()) / 60_000));
      const expired = state.expiresAt < Date.now();
      return [
        `Conversation state: AWAITING CONFIRMATION`,
        `Proposed action: ${state.action}${state.amount ? ` for $${state.amount}` : ''}${state.recipient ? ` to ${state.recipient}` : ''}`,
        expired
          ? `Status: EXPIRED — ask if user still wants to proceed`
          : `Expires in: ${expiryMins} minutes`,
        `"yes/confirm/do it" → execute. "no/cancel/wait" → abort, reset to idle.`,
      ].join('\n');
    }

    case 'post_error':
      return [
        `Conversation state: POST-ERROR`,
        `Failed action: ${state.failedAction}`,
        `Error: ${state.errorMessage}`,
        state.partialState ? `Partial state: ${state.partialState}` : '',
        `Acknowledge failure clearly. Offer a specific recovery path if one exists.`,
        `This state clears automatically on the next successful action.`,
      ].filter(Boolean).join('\n');

    case 'post_liquidation_warning':
      return [
        `Conversation state: LIQUIDATION WARNING ACTIVE`,
        `Health factor: ${state.healthFactor.toFixed(2)} — below safe threshold`,
        `Prioritise debt repayment or collateral deposit.`,
        `Do not proceed with any action that would further reduce health factor.`,
      ].join('\n');

    case 'onboarding':
      return [
        `Conversation state: ONBOARDING (session ${state.sessionNumber})`,
        state.sessionNumber === 1
          ? 'First session — introduce capabilities through context, not a feature list.'
          : `Returning user — ${state.hasSavedBefore ? 'has saved before' : 'has not saved yet'}.`,
      ].join('\n');

    default:
      return '';
  }
}
