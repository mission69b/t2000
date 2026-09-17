import { describe, expect, it } from 'vitest';
import { jobThreadChallengeMessage } from './challenge.js';
import { jobThreadPayload } from './job-thread.js';

const JOB = `0x${'a'.repeat(64)}`;

describe('job delivery thread (S.1369) — CLI / local-key half', () => {
  it('challenge grammar: t2000-job-thread:<nonce>:<sha256 hex>', () => {
    expect(jobThreadChallengeMessage('n0nce', 'ab'.repeat(32))).toBe(
      `t2000-job-thread:n0nce:${'ab'.repeat(32)}`,
    );
  });

  it('payload: fixed key order; read carries no body; post needs text and/or images', () => {
    expect(JSON.stringify(jobThreadPayload({ action: 'read', jobId: JOB, body: 'ignored' }))).toBe(
      JSON.stringify({ action: 'read', jobId: JOB }),
    );
    expect(jobThreadPayload({ action: 'post', jobId: JOB, body: ' lane ' })).toEqual({
      action: 'post',
      jobId: JOB,
      body: 'lane',
    });
    expect(
      jobThreadPayload({ action: 'post', jobId: JOB, images: ['https://x/a.jpg', ' '] }),
    ).toEqual({ action: 'post', jobId: JOB, images: ['https://x/a.jpg'] });
    expect(() => jobThreadPayload({ action: 'post', jobId: JOB, body: '   ' })).toThrow(/message and\/or/);
    expect(() => jobThreadPayload({ action: 'read', jobId: '0x12' })).toThrow(/full 0x/);
  });
});
