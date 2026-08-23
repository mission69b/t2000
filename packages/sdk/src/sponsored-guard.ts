// The host-installed veto on sponsored transactions (S.930) — ONE hook for
// every SDK path that signs server-prepared bytes: the open board
// (`open-jobs.ts`) and seller onboarding (`commerce/`). Called twice per
// verb: once with no `txBytes` before the prepare request (an untrusted API
// host can be refused before it learns the address), and once with the
// prepared bytes before they are signed. Throwing from either aborts.
//
// The SDK deliberately ships NO default policy: package-id verification
// needs non-env literals and a notion of "the canonical host", both of
// which belong to the host application (the CLI installs
// `installSponsoredTxGuard`). Unset = trust the host.

export type SponsoredTxGuard = (ctx: {
  base: string;
  action: string;
  txBytes?: string;
}) => void;

let sponsoredTxGuard: SponsoredTxGuard | null = null;

/** Install (or clear, with `null`) the sponsored-tx guard. */
export function setSponsoredTxGuard(guard: SponsoredTxGuard | null): void {
  sponsoredTxGuard = guard;
}

/** Run the installed guard (no-op when none is installed). */
export function runSponsoredTxGuard(ctx: {
  base: string;
  action: string;
  txBytes?: string;
}): void {
  sponsoredTxGuard?.(ctx);
}
