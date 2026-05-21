import { describe, it, expect } from 'vitest';
import { DEFAULT_SYSTEM_PROMPT } from './index.js';

// S.245 (2026-05-22) — pay_api + mpp_services deleted from engine per
// V07E_D_QUESTION_AUDITS D-2 reframe. The pre-S.245 SPEC 24 F1 + 1.29.1
// prompt-drift pins were tied to the MPP services block (now removed);
// they no longer apply. This file is now a thin invariant pin that
// asserts the MPP/pay_api framing stays REMOVED — if it drifts back,
// the test fires and surfaces it.
describe('[S.245] DEFAULT_SYSTEM_PROMPT — pay_api + MPP removed', () => {
  it('no longer mentions pay_api', () => {
    expect(DEFAULT_SYSTEM_PROMPT).not.toMatch(/pay_api/);
  });

  it('no longer mentions mpp_services', () => {
    expect(DEFAULT_SYSTEM_PROMPT).not.toMatch(/mpp_services/);
  });

  it('no longer advertises the 5-service MPP catalog (openai/elevenlabs/pdfshift/lob/resend)', () => {
    expect(DEFAULT_SYSTEM_PROMPT).not.toMatch(/locked supported set/i);
    expect(DEFAULT_SYSTEM_PROMPT).not.toMatch(/## MPP services/);
  });

  it('declines paid-API workflows honestly (image gen, transcription, TTS, GPT-4o, postcards, transactional email)', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/CAPABILITY DEFERRED/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/Audric Store \(coming soon\)/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/Do NOT promise a timeline/);
  });

  it('keeps native abilities (translation, summarization, math, coding help) explicit', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/Translation between languages/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/summarization/i);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/coding help/);
  });

  it('header advertises the 4-system brain (Memory absorbed Silent Profile + Chain Memory in v0.7d Block A)', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/4-system brain/);
    expect(DEFAULT_SYSTEM_PROMPT).not.toMatch(/5-system brain/);
  });
});
