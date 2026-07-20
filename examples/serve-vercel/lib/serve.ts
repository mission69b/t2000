import { createServeFromEnv } from '@t2000/serve';

// One instance for the whole app. Reads T2000_PAY_TO (required) and the
// optional KV_REST_API_URL / KV_REST_API_TOKEN pair from env — set them in
// the Vercel dashboard. See README for the full env contract.
export const serve = createServeFromEnv();
