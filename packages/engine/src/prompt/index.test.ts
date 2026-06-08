import { describe, it, expect } from 'vitest';
import { DEFAULT_SYSTEM_PROMPT } from './index.js';

// S.245 (2026-05-22) deleted pay_api + mpp_services from the engine. The
// MPP re-enable (Channel A, 2026-06-08) brought MPP back via the new
// `mpp_services` (discover) + `mpp_call` (pay) tools — so the prompt now
// STEERS toward them instead of declining. `pay_api` stays dead (the
// re-enable uses `mpp_call`, not the legacy `pay_api`), and the prompt
// must NOT hardcode a static catalog (the live `mpp_services` fetch is the
// source of truth). These pins guard that framing.
describe('DEFAULT_SYSTEM_PROMPT — MPP re-enabled (Channel A)', () => {
  it('does not resurrect the legacy pay_api tool name', () => {
    expect(DEFAULT_SYSTEM_PROMPT).not.toMatch(/pay_api/);
  });

  it('steers toward mpp_services + mpp_call for paid Services', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/mpp_services/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/mpp_call/);
  });

  it('does not hardcode a static MPP catalog (live mpp_services fetch is the source of truth)', () => {
    expect(DEFAULT_SYSTEM_PROMPT).not.toMatch(/locked supported set/i);
    expect(DEFAULT_SYSTEM_PROMPT).not.toMatch(/## MPP services/);
  });

  it('offers paid Services via MPP (mpp_services discover → mpp_call pay), not a decline', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/AVAILABLE via MPP/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/mpp_services/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/mpp_call/);
    // The old "capability deferred / coming back as Audric Store" decline is gone.
    expect(DEFAULT_SYSTEM_PROMPT).not.toMatch(/CAPABILITY DEFERRED/);
    expect(DEFAULT_SYSTEM_PROMPT).not.toMatch(/coming back as part of Audric Store/);
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
