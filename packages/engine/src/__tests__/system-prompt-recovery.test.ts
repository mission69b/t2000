/**
 * [S.123-FU v1.24.8] Regression tests for the system-prompt sections that
 * encode our deterministic recovery paths.
 *
 * These tests are pure string assertions — they don't run the LLM. The point
 * is that the rules MUST be in the prompt for the agent to follow them. If a
 * future refactor removes a section (or rewords it past recognition), CI
 * fails fast instead of waiting for a user to hit the now-broken recovery
 * path in production.
 *
 * The prompt is plain TS string template, so editing it is high-frequency
 * and easy. That makes accidental drift a real risk — these tests are the
 * cheap insurance.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_SYSTEM_PROMPT } from '../prompt/index.js';

describe('DEFAULT_SYSTEM_PROMPT — S.123 recovery rules (regression)', () => {
  describe('Recoverable tool errors section', () => {
    it('contains the Recoverable tool errors heading', () => {
      expect(DEFAULT_SYSTEM_PROMPT).toContain('## Recoverable tool errors');
    });

    it('tells the LLM to call navi_navi_search_tokens on ASSET_NOT_SUPPORTED', () => {
      expect(DEFAULT_SYSTEM_PROMPT).toContain('ASSET_NOT_SUPPORTED');
      expect(DEFAULT_SYSTEM_PROMPT).toContain('navi_navi_search_tokens');
    });

    it('tells the LLM to call balance_check on SWAP_FAILED', () => {
      expect(DEFAULT_SYSTEM_PROMPT).toContain('SWAP_FAILED');
      expect(DEFAULT_SYSTEM_PROMPT).toContain('balance_check');
    });

    it('reminds the LLM to check recoverable: true first', () => {
      expect(DEFAULT_SYSTEM_PROMPT).toMatch(/recoverable:\s*true/);
    });
  });

  describe('Authentication (you CANNOT log users in or out) section', () => {
    it('explicitly states the LLM has NO logout/login tool', () => {
      expect(DEFAULT_SYSTEM_PROMPT).toMatch(/Authentication.*you CANNOT log users in or out/);
    });

    it('directs the LLM to the avatar menu for logout requests', () => {
      expect(DEFAULT_SYSTEM_PROMPT).toContain('avatar in the top-right');
    });

    it('directs the LLM to the Sign back in button for session-expired bundles', () => {
      expect(DEFAULT_SYSTEM_PROMPT).toContain('Sign back in');
    });

    it('warns against narrating fake logout success', () => {
      expect(DEFAULT_SYSTEM_PROMPT).toMatch(/do NOT narrate fake success|worst possible behavior/i);
    });
  });

  describe('Unrecognized swap tokens section (S.123-FU)', () => {
    it('contains the Unrecognized swap tokens heading', () => {
      expect(DEFAULT_SYSTEM_PROMPT).toContain('## Unrecognized swap tokens');
    });

    it('tells the LLM the supported-tokens hint is NOT exhaustive', () => {
      expect(DEFAULT_SYSTEM_PROMPT).toMatch(/NOT exhaustive/);
    });

    it('allows a typo-check on the first turn for likely typos', () => {
      // We want the LLM to keep helping ("did you mean SUI?") on first turn —
      // this is good UX. The fix is for the SECOND turn, not removing the
      // first-turn check.
      expect(DEFAULT_SYSTEM_PROMPT).toMatch(/typo|likely typo/i);
    });

    it('REQUIRES the LLM to call navi_navi_search_tokens on second-turn confirmation', () => {
      // The exact rule from the prompt: "When the user clarifies they really
      // mean the obscure token … DO NOT ask again. Call navi_navi_search_tokens."
      expect(DEFAULT_SYSTEM_PROMPT).toMatch(/DO NOT ask again/);
      // Make sure navi_navi_search_tokens is mentioned in the obscure-token
      // recovery context (occurs in both error-recovery section and this one).
      const occurrences = DEFAULT_SYSTEM_PROMPT.split('navi_navi_search_tokens').length - 1;
      expect(occurrences).toBeGreaterThanOrEqual(2);
    });

    it('handles the explicit-coin-type case (skip the typo check)', () => {
      // When the user pastes a full coin type like 0x...::module::TYPE, the
      // LLM should skip the clarifying question entirely.
      expect(DEFAULT_SYSTEM_PROMPT).toMatch(/full coin type/);
    });

    it('mentions Spring SUI / sSUI as a worked example', () => {
      // The bug that motivated this rule. If a future edit removes the example,
      // we lose the most concrete teaching surface for the LLM.
      expect(DEFAULT_SYSTEM_PROMPT).toMatch(/spring.?sui|SPRING_SUI|sSUI/i);
    });
  });
});
