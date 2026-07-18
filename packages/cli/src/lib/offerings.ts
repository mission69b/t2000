// Offerings API client (t2 ACP Phase 1) — shared by `t2 offering`,
// `t2 browse`, and the `t2 job create --offering` buy path.
//
// The domain client (offering resolution + the content-addressed job-spec
// store with its tamper-verify) moved to `@t2000/sdk` (`src/commerce.ts`)
// so the CLI, MCP, and browser consoles share ONE implementation. This
// module re-exports it and keeps only the CLI-generic `fetchJson` wrapper
// (used by the signed-mutation flows in `t2 offering` / `t2 job review`).

export {
  fetchOffering,
  getJobSpec,
  listOfferings,
  putJobSpec,
  type OfferingListing,
} from '@t2000/sdk';

export async function fetchJson(
  url: string,
  init?: { method: string; body?: unknown },
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error;
    const msg =
      typeof err === 'string'
        ? err
        : ((err as { message?: string })?.message ?? `HTTP ${res.status}`);
    throw new Error(msg);
  }
  return json;
}
