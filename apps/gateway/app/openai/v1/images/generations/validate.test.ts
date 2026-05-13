/**
 * Pre-charge validation regression tests for openai/v1/images/generations.
 *
 * Each test asserts the validate hook returns a STRING (which `chargeProxy`
 * surfaces as a 400) for inputs that would otherwise charge → fail post-charge.
 * The structural "charge before delivery" issue is solved in SPEC 26
 * (MPP_SETTLE_ON_SUCCESS); this file is the defense-in-depth backstop.
 */
import { describe, it, expect } from 'vitest';

import { validateImagesGenerationsBody } from './validate';

const OK_ENV = { blobToken: 'test-token' };

describe('validateImagesGenerationsBody — env gates', () => {
  it('rejects when BLOB_READ_WRITE_TOKEN is missing', () => {
    const out = validateImagesGenerationsBody({}, { blobToken: undefined });
    expect(out).toMatch(/BLOB_READ_WRITE_TOKEN is required/);
  });

  it('rejects when BLOB_READ_WRITE_TOKEN is empty string', () => {
    const out = validateImagesGenerationsBody({}, { blobToken: '' });
    expect(out).toMatch(/BLOB_READ_WRITE_TOKEN is required/);
  });
});

describe('validateImagesGenerationsBody — model allow-list', () => {
  it('passes when model is omitted (OpenAI default applies)', () => {
    expect(validateImagesGenerationsBody({}, OK_ENV)).toBeNull();
  });

  it('passes for gpt-image-1', () => {
    expect(
      validateImagesGenerationsBody({ model: 'gpt-image-1' }, OK_ENV),
    ).toBeNull();
  });

  it('passes for gpt-image-1-mini', () => {
    expect(
      validateImagesGenerationsBody({ model: 'gpt-image-1-mini' }, OK_ENV),
    ).toBeNull();
  });

  it('rejects deprecated dall-e-3 with the deprecation note', () => {
    const out = validateImagesGenerationsBody({ model: 'dall-e-3' }, OK_ENV);
    expect(out).toMatch(/Model "dall-e-3" is not currently supported/);
    expect(out).toMatch(/dall-e-3 and dall-e-2 were shut down/);
  });

  it('rejects deprecated dall-e-2', () => {
    const out = validateImagesGenerationsBody({ model: 'dall-e-2' }, OK_ENV);
    expect(out).toMatch(/Model "dall-e-2" is not currently supported/);
  });

  it('rejects unknown model name (future-proofing for typos)', () => {
    const out = validateImagesGenerationsBody({ model: 'gpt-image-2' }, OK_ENV);
    expect(out).toMatch(/Model "gpt-image-2" is not currently supported/);
  });

  it('rejects non-string model with type-of message', () => {
    const out = validateImagesGenerationsBody(
      { model: 42 as unknown as string },
      OK_ENV,
    );
    expect(out).toMatch(/Model must be a string. Got: number/);
  });
});

describe('validateImagesGenerationsBody — size allow-list', () => {
  it('passes when size is omitted (OpenAI default applies)', () => {
    expect(validateImagesGenerationsBody({}, OK_ENV)).toBeNull();
  });

  it('passes for 1024x1024 (square default)', () => {
    expect(
      validateImagesGenerationsBody({ size: '1024x1024' }, OK_ENV),
    ).toBeNull();
  });

  it('passes for 1024x1536 (portrait)', () => {
    expect(
      validateImagesGenerationsBody({ size: '1024x1536' }, OK_ENV),
    ).toBeNull();
  });

  it('passes for 1536x1024 (landscape)', () => {
    expect(
      validateImagesGenerationsBody({ size: '1536x1024' }, OK_ENV),
    ).toBeNull();
  });

  it('passes for "auto"', () => {
    expect(validateImagesGenerationsBody({ size: 'auto' }, OK_ENV)).toBeNull();
  });

  it('rejects DALL-E 2 legacy 256x256 with the actionable note', () => {
    // The exact failure mode that bit P7 smoke 2026-05-13 (frog probe retry,
    // tx DdGpKeRs...LzqqGV, $0.05 lost). Once shipped, this can never recur.
    const out = validateImagesGenerationsBody({ size: '256x256' }, OK_ENV);
    expect(out).toMatch(/Size "256x256" is not currently supported/);
    expect(out).toMatch(/256x256 and 512x512 are DALL-E 2 legacy values/);
  });

  it('rejects DALL-E 2 legacy 512x512', () => {
    const out = validateImagesGenerationsBody({ size: '512x512' }, OK_ENV);
    expect(out).toMatch(/Size "512x512" is not currently supported/);
  });

  it('rejects DALL-E 3 legacy 1792x1024', () => {
    // DALL-E 3 supported 1792x1024; gpt-image-* moved to 1536x1024. Catch it.
    const out = validateImagesGenerationsBody({ size: '1792x1024' }, OK_ENV);
    expect(out).toMatch(/Size "1792x1024" is not currently supported/);
  });

  it('rejects non-string size', () => {
    const out = validateImagesGenerationsBody(
      { size: 1024 as unknown as string },
      OK_ENV,
    );
    expect(out).toMatch(/Size must be a string. Got: number/);
  });
});

describe('validateImagesGenerationsBody — combined real-world cases', () => {
  it('passes when both model and size are valid', () => {
    expect(
      validateImagesGenerationsBody(
        { model: 'gpt-image-1', size: '1024x1024' },
        OK_ENV,
      ),
    ).toBeNull();
  });

  it('rejects with model error first when both are bad (model gate runs first)', () => {
    const out = validateImagesGenerationsBody(
      { model: 'dall-e-3', size: '256x256' },
      OK_ENV,
    );
    expect(out).toMatch(/Model "dall-e-3"/);
    expect(out).not.toMatch(/Size "256x256"/);
  });

  it('reaches size gate when model is valid but size is bad', () => {
    // The actual P7 frog smoke retry shape — model was correct, size was the
    // legacy value that slipped through.
    const out = validateImagesGenerationsBody(
      { model: 'gpt-image-1', size: '256x256' },
      OK_ENV,
    );
    expect(out).toMatch(/Size "256x256" is not currently supported/);
  });

  it('passes the full real-world request shape (prompt + n + model + size)', () => {
    expect(
      validateImagesGenerationsBody(
        {
          model: 'gpt-image-1',
          prompt: 'a green frog wearing a top hat',
          n: 1,
          size: '1024x1024',
        },
        OK_ENV,
      ),
    ).toBeNull();
  });
});
