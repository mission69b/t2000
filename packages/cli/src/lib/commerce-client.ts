// The CLI's handle on the SDK's seller-onboarding SSOT (S.1158). Every
// `t2 agent *` / `t2 service *` write goes through `CommerceClient`; the
// two S.930 locks still apply because the SDK's sponsored verbs call the
// guard `installSponsoredTxGuard` installed (host pin + intent check).

import { CommerceClient, type T2000 } from '@t2000/sdk';

export function commerceFor(agent: T2000, base: string): CommerceClient {
  return new CommerceClient({ signer: agent.signer, apiBase: base });
}
