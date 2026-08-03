import { asNextRoute } from '@t2000/serve';
import { z } from 'zod';
import { serve } from '../../lib/serve';

// A complete paid endpoint. Swap the handler for your real API — the
// payments, validation, replay protection, and discovery stay correct.
const haikuInput = z.object({
  topic: z.string().min(1).max(80).describe('What the haiku should be about'),
});

const LINES: Array<(t: string) => string> = [
  (t) => `${t} at dawn`,
  (t) => `machines pay machines for ${t}`,
  () => 'the escrow settles',
];

// asNextRoute exports OPTIONS alongside POST — Next only dispatches the
// methods a route.ts exports, and without OPTIONS the browser CORS
// preflight never reaches serve (browser buyers fail; CLI still works).
export const { POST, OPTIONS } = asNextRoute(
  serve
    .route({ path: 'haiku', description: 'A haiku about your topic, paid per call' })
    .paid('0.01')
    .body(haikuInput, z.toJSONSchema(haikuInput))
    .handler(({ body, payer }) => ({
      haiku: LINES.map((line) => line(body.topic)),
      topic: body.topic,
      paidBy: payer,
    })),
);
