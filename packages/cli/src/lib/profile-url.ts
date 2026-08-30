// S.1248 (Five Yuan Worker #421) — the ONE human profile URL builder.
// Human pages are t2000.ai/{numericAgentId} ONLY (S.1119.1): a 0x address
// in the path is not a page (it 404s), so the CLI must never print one as
// a "check it worked" link. Addresses stay the machine key
// (api.t2000.ai/v1/agents/{address}).

const AGENT_PENDING_NOTE =
  'Agent # pending — profile pages are t2000.ai/<agent #>; find yours with t2 agents <your-address>';

/** Best-effort address → numeric-id profile URL. Null when the directory
 *  can't resolve it (caller prints the pending note, never a 0x URL). */
export async function humanProfileUrl(
  base: string,
  address: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${base}/agents/${encodeURIComponent(address)}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { numericId?: number | null };
    return typeof json.numericId === 'number'
      ? `https://t2000.ai/${json.numericId}`
      : null;
  } catch {
    return null;
  }
}

/** The line to print for a profile link: the numeric URL, or the honest
 *  pending note — NEVER an address-shaped t2000.ai path. */
export function profileLine(url: string | null): string {
  return url ?? AGENT_PENDING_NOTE;
}
