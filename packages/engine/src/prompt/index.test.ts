import { describe, it, expect } from 'vitest';
import { DEFAULT_SYSTEM_PROMPT } from './index.js';

// SPEC 24 F1 (locked 2026-05-11) — pin the locked 5-service set in the system
// prompt's MPP guidance block. If the prompt drifts (someone re-introduces
// "40+ services", or removes the intent → service mapping, or re-adds a
// dropped service like Fal/Anthropic/Suno to the supported list), these tests
// fail and surface it before the LLM starts hallucinating.
describe('[SPEC 24 F1] DEFAULT_SYSTEM_PROMPT — MPP services block', () => {
  it('does NOT claim 40+ paid APIs anymore (5 supported services post-SPEC-24)', () => {
    expect(DEFAULT_SYSTEM_PROMPT).not.toMatch(/40\+ paid APIs/);
  });

  it('does NOT advertise music as available (Suno not deployed pre-Phase-5)', () => {
    // The prompt must not appear to OFFER music. The "decline honestly" block
    // mentioning "Music composition (Suno coming Phase 5)" is fine — it's the
    // explicit decline path. The header description must not list it as a
    // capability.
    const headerLine = DEFAULT_SYSTEM_PROMPT.split('\n')[0];
    expect(headerLine).not.toMatch(/music/i);
  });

  it('header lists the actual 7 supported intents (image, transcription, content, audio, PDF, mail, email)', () => {
    const headerLine = DEFAULT_SYSTEM_PROMPT.split('\n')[0];
    expect(headerLine).toMatch(/image generation/i);
    expect(headerLine).toMatch(/transcription/i);
    expect(headerLine).toMatch(/content generation/i);
    expect(headerLine).toMatch(/premium audio/i);
    expect(headerLine).toMatch(/PDF binding/i);
    expect(headerLine).toMatch(/physical mail/i);
    expect(headerLine).toMatch(/transactional email/i);
  });

  it('contains a dedicated § MPP services block', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/## MPP services \(pay_api\) — locked supported set/);
  });

  it('enumerates the locked 5 services with their costs', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/openai\s+— DALL-E images \$0\.05.*Whisper transcription \$0\.01.*GPT-4o chat \$0\.01/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/elevenlabs\s+— premium TTS \$0\.05.*sound effects \$0\.05/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/pdfshift\s+— HTML\/URL → PDF conversion \$0\.01/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/lob\s+— physical postcards \$1\.00.*letters \$1\.50.*address verification \$0\.01/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/resend\s+— transactional email \$0\.005.*batch email \$0\.01/);
  });

  it('teaches intent → service mapping for every supported lane', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/openai DALL-E/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/openai Whisper/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/openai GPT-4o/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/elevenlabs TTS/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/elevenlabs sound-generation/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/pdfshift/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/lob \(postcard|Send a postcard/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/resend/);
  });

  it('teaches multi-step PDF composition pattern (DALL-E images + pdfshift bind)', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/colouring book.*N x openai DALL-E.*pdfshift bind/i);
  });

  it('explicitly lists what we DO NOT support (Fal, Claude/Gemini chat, music, search, weather, translation)', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/Music composition.*Suno coming Phase 5/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/Fal Flux/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/Alternative chat models.*Claude.*Gemini/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/Web search, news, research/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/Translation/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/Weather, forex/);
  });

  it('teaches honest-decline behavior for unsupported intents', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/Audric doesn't have/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/Don't apologize, don't promise a workaround/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/don't invent a service/);
  });

  it('teaches mpp_services 0-result recovery (follow _refine validCategories)', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/mpp_services discovery rules/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/_refine payload with validCategories/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/RE-CALL with one of those valid categories/);
  });

  it('replaces old "real-world questions (weather, search, news, prices)" framing with the supported-set framing', () => {
    // Old framing implied pay_api was for data fetches only — that allowed
    // weather/search/news/prices to drift back as expectations. Post-SPEC-24
    // the framing is locked to the 5 supported services.
    expect(DEFAULT_SYSTEM_PROMPT).not.toMatch(/For real-world questions \(weather, search, news, prices\), use pay_api/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/For image generation, transcription, content generation, premium TTS \/ sound effects, HTML→PDF, physical mail, or transactional email, use pay_api/);
  });
});
