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
    // 2026-05-14: openai images line was `openai — DALL-E images $0.05` —
    // updated to `openai — image generation (gpt-image-1) $0.05` after the
    // dall-e-* shutdown and to stop the LLM narrating "DALL-E" to users.
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/openai\s+— image generation \(gpt-image-1\) \$0\.05.*Whisper transcription \$0\.01.*GPT-4o chat \$0\.01/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/elevenlabs\s+— premium TTS \$0\.05.*sound effects \$0\.05/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/pdfshift\s+— HTML\/URL → PDF conversion \$0\.01/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/lob\s+— physical postcards \$1\.00.*letters \$1\.50.*address verification \$0\.01/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/resend\s+— transactional email \$0\.005.*batch email \$0\.01/);
  });

  it('teaches intent → service mapping for every supported lane', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/openai images \(gpt-image-1/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/openai Whisper/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/openai GPT-4o/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/elevenlabs TTS/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/elevenlabs sound-generation/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/pdfshift/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/lob \(postcard|Send a postcard/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/resend/);
  });

  it('teaches multi-step PDF composition pattern (openai images + pdfshift bind)', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/colouring book.*N x openai images.*pdfshift bind/i);
  });

  it('does NOT mention DALL-E anywhere in DEFAULT_SYSTEM_PROMPT (post-shutdown brand cleanup)', () => {
    expect(DEFAULT_SYSTEM_PROMPT).not.toMatch(/DALL-E|DALLE|dall-e|dalle/i);
  });

  it('explicitly lists what we CANNOT do (genuinely unavailable: music, search, weather, maps, etc.)', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/What we CANNOT do/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/Music composition.*Suno coming Phase 5/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/Fal Flux/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/Alternative chat models.*Gemini, Mistral/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/Live web search, news feeds/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/Live weather, forex/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/Maps, geocoding/);
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

// SPEC 24 1.29.1 patch — close 3 audit gaps surfaced before founder smoke:
//   G1 — GPT-4o ambiguity: prompt offered $0.01 GPT-4o for "draft a guide"
//        but Audric IS Claude — LLM had no instruction on when to spend.
//   G2 — "What services?" leak: LLM might enumerate the full 40-service
//        gateway catalog (Fal, Suno, Anthropic, etc.) when asked, even
//        though only 5 are supported.
//   G3 — Translation/research conflated with "decline outright" — but
//        Audric (Claude) can translate / summarize / explain natively.
//        The blanket-decline list refused things the LLM could just do.
describe('[SPEC 24 1.29.1] DEFAULT_SYSTEM_PROMPT — audit-gap patches', () => {
  describe('G1 — GPT-4o is paid-only when explicitly requested (default to native Claude)', () => {
    it('teaches "default = native (free), paid = explicit-request only"', () => {
      expect(DEFAULT_SYSTEM_PROMPT).toMatch(
        /write it natively \(FREE — you are Claude\)/,
      );
      expect(DEFAULT_SYSTEM_PROMPT).toMatch(
        /Only call openai GPT-4o.*when the user EXPLICITLY asks/,
      );
      expect(DEFAULT_SYSTEM_PROMPT).toMatch(
        /Default = native, paid = explicit-request only/,
      );
    });

    it('still keeps the GPT-4o intent mapping line (we offer the option, just gated)', () => {
      expect(DEFAULT_SYSTEM_PROMPT).toMatch(/openai GPT-4o \(\$0\.01\)/);
    });
  });

  describe('G2 — "What services do you offer?" lists ONLY the 5 supported', () => {
    it('teaches the LLM to list only the 5 supported services, never enumerate the full catalog', () => {
      expect(DEFAULT_SYSTEM_PROMPT).toMatch(
        /What services do you offer\?.*list ONLY the 5 supported services/,
      );
      expect(DEFAULT_SYSTEM_PROMPT).toMatch(
        /NEVER enumerate the full mpp_services catalog to the user/,
      );
      expect(DEFAULT_SYSTEM_PROMPT).toMatch(
        /that catalog is for YOUR URL\/schema discovery, not their consumption/,
      );
    });

    it('explicitly states the gateway hosts ~40 services but Audric only supports 5', () => {
      expect(DEFAULT_SYSTEM_PROMPT).toMatch(
        /gateway hosts ~40 services but Audric only supports 5/,
      );
    });
  });

  describe('G3 — Audric CAN translate / summarize / explain natively (no MPP call)', () => {
    it('has a dedicated "What Audric CAN do natively" block', () => {
      expect(DEFAULT_SYSTEM_PROMPT).toMatch(
        /What Audric CAN do natively \(no MPP call needed/,
      );
    });

    it('lists translation as a native ability (NOT a decline)', () => {
      expect(DEFAULT_SYSTEM_PROMPT).toMatch(
        /Translation between languages \(you can translate;/,
      );
    });

    it('lists summarization, research-as-explain, comparing concepts as native', () => {
      expect(DEFAULT_SYSTEM_PROMPT).toMatch(
        /Summarization, research-as-explain, comparing concepts/,
      );
    });

    it('clarifies resend is only for SENDING via SMTP, not for drafting an email body', () => {
      expect(DEFAULT_SYSTEM_PROMPT).toMatch(
        /USE pay_api → resend ONLY when the user explicitly wants the email SENT to a recipient via SMTP/,
      );
    });

    it('teaches: "just do it natively, don\'t quote a cost, don\'t call pay_api"', () => {
      expect(DEFAULT_SYSTEM_PROMPT).toMatch(
        /just do it natively\. Don't quote a cost, don't call pay_api/,
      );
    });

    it('keeps "Translation" out of the CANNOT-do block (post-G3 it is a CAN-do natively item)', () => {
      // Find the CANNOT block and assert "Translation" is NOT inside it.
      // We do this by extracting the text between "What we CANNOT do" and
      // "What Audric CAN do natively" — Translation should appear AFTER
      // the second header, not inside the CANNOT block.
      const cannotIdx = DEFAULT_SYSTEM_PROMPT.indexOf('What we CANNOT do');
      const canIdx = DEFAULT_SYSTEM_PROMPT.indexOf('What Audric CAN do natively');
      expect(cannotIdx).toBeGreaterThan(0);
      expect(canIdx).toBeGreaterThan(cannotIdx);
      const cannotBlock = DEFAULT_SYSTEM_PROMPT.slice(cannotIdx, canIdx);
      // Pre-G3: "Translation (DeepL, Google Translate)" was inside the CANNOT block.
      // Post-G3: it must NOT be there — it lives in the CAN-natively block instead.
      expect(cannotBlock).not.toMatch(/Translation \(DeepL/);
      expect(cannotBlock).not.toMatch(/^- Translation/m);
    });
  });
});
