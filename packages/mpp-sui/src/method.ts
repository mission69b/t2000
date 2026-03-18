import { Method, z } from 'mppx';

export const suiCharge = Method.from({
  intent: 'charge',
  name: 'sui',
  schema: {
    credential: {
      payload: z.object({
        digest: z.string(),
      }),
    },
    request: z.object({
      amount: z.string(),
      currency: z.string(),
      recipient: z.string(),
    }),
  },
});
