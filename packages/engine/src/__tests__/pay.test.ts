import { describe, it, expect } from 'vitest';
import { payApiTool, estimatePayApiCost } from '../tools/pay.js';

describe('pay_api tool — contract', () => {
  it('name is pay_api', () => {
    expect(payApiTool.name).toBe('pay_api');
  });

  it('requires user approval (confirm permission)', () => {
    expect(payApiTool.permissionLevel).toBe('confirm');
  });

  it('is a write tool', () => {
    expect(payApiTool.isReadOnly).toBe(false);
  });

  it('requires url in JSON schema', () => {
    const required = payApiTool.jsonSchema.required as string[];
    expect(required).toContain('url');
  });
});

describe('pay_api tool — safety requirements in description', () => {
  const desc = payApiTool.description;

  it('warns about non-retryable errors (doNotRetry / DO NOT call again)', () => {
    expect(desc).toMatch(/DO NOT call pay_api again|doNotRetry/);
  });

  it('mentions paymentConfirmed flag', () => {
    expect(desc).toContain('paymentConfirmed');
  });

  it('includes ISO country code guidance (GB)', () => {
    expect(desc).toContain('GB');
    expect(desc).toMatch(/ISO/i);
  });

  it('mentions return address is auto-added', () => {
    expect(desc).toMatch(/return address/i);
  });
});

// SPEC 24 F1 (locked 2026-05-11) — pin the locked 5-service set in the description.
// If the description drifts (someone re-introduces fal, or "40+ services" framing
// creeps back in), these tests fail and surface it before the LLM starts
// hallucinating services that aren't supported.
describe('pay_api tool — SPEC 24 locked 5-service set in description', () => {
  const desc = payApiTool.description;

  it('does NOT claim 40+ services anymore (5 supported services post-SPEC-24)', () => {
    expect(desc).not.toMatch(/40\+ services|88 endpoints/);
  });

  it('explicitly enumerates the 5 supported services', () => {
    for (const service of ['openai', 'elevenlabs', 'pdfshift', 'lob', 'resend']) {
      expect(desc).toContain(service);
    }
  });

  it('Lob postcard flow uses openai DALL-E (not fal/fal-ai/flux/dev)', () => {
    expect(desc).not.toMatch(/fal\/fal-ai\/flux\/dev/);
    expect(desc).toMatch(/openai\/v1\/images\/generations/);
  });

  it('teaches multi-step PDF composition (DALL-E images → PDFShift bind)', () => {
    expect(desc).toMatch(/PDFShift/);
    expect(desc).toMatch(/HTML.*image URLs|images first/i);
  });

  it('teaches the LLM to decline unsupported intents (Fal / Anthropic / Suno)', () => {
    expect(desc).toMatch(/Fal.*Anthropic.*Gemini.*Suno|Audric does NOT support|decline honestly/);
  });
});

describe('estimatePayApiCost — SPEC 24 locked 5-service prices', () => {
  // openai (3 endpoints, distinct prices)
  it('DALL-E images = $0.05', () => {
    expect(estimatePayApiCost('https://mpp.t2000.ai/openai/v1/images/generations')).toBe(0.05);
  });

  it('Whisper transcription = $0.01', () => {
    expect(estimatePayApiCost('https://mpp.t2000.ai/openai/v1/audio/transcriptions')).toBe(0.01);
  });

  it('GPT-4o chat = $0.01', () => {
    expect(estimatePayApiCost('https://mpp.t2000.ai/openai/v1/chat/completions')).toBe(0.01);
  });

  // elevenlabs (2 endpoints, both $0.05)
  it('ElevenLabs TTS = $0.05', () => {
    expect(estimatePayApiCost('https://mpp.t2000.ai/elevenlabs/v1/text-to-speech/voiceId')).toBe(0.05);
  });

  it('ElevenLabs sound generation = $0.05', () => {
    expect(estimatePayApiCost('https://mpp.t2000.ai/elevenlabs/v1/sound-generation')).toBe(0.05);
  });

  // pdfshift
  it('PDFShift convert = $0.01', () => {
    expect(estimatePayApiCost('https://mpp.t2000.ai/pdfshift/v1/convert')).toBe(0.01);
  });

  // lob (3 endpoints, distinct prices, ordering matters)
  it('Lob postcard = $1.00 (postcards-specific pattern matches before generic /lob/)', () => {
    expect(estimatePayApiCost('https://mpp.t2000.ai/lob/v1/postcards')).toBe(1.00);
  });

  it('Lob letter = $1.50 (letters-specific pattern matches before generic /lob/)', () => {
    expect(estimatePayApiCost('https://mpp.t2000.ai/lob/v1/letters')).toBe(1.50);
  });

  it('Lob address-verify = $0.01 (falls to generic /lob/ pattern after specifics miss)', () => {
    expect(estimatePayApiCost('https://mpp.t2000.ai/lob/v1/address-verify')).toBe(0.01);
  });

  // resend
  it('Resend email = $0.005', () => {
    expect(estimatePayApiCost('https://mpp.t2000.ai/resend/v1/emails')).toBe(0.005);
  });

  // unsupported services hit the safe default
  it('returns default 0.005 for an unsupported service (e.g. fal — dropped per SPEC 24)', () => {
    expect(estimatePayApiCost('https://mpp.t2000.ai/fal/fal-ai/flux/dev')).toBe(0.005);
  });

  it('returns default 0.005 for unknown / future services', () => {
    expect(estimatePayApiCost('https://mpp.t2000.ai/unknown/v1/thing')).toBe(0.005);
  });
});
