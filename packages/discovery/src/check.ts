import { discover } from './discover.js';
import { probe } from './probe.js';
import type { CheckResult } from './types.js';

export interface CheckOptions {
  probeEndpoint?: boolean;
}

export async function check(
  origin: string,
  options: CheckOptions = {},
): Promise<CheckResult> {
  const { probeEndpoint = true } = options;

  const normalizedOrigin = origin.startsWith('http') ? origin : `https://${origin}`;
  const discovery = await discover(normalizedOrigin);

  let probeResult = undefined;
  if (probeEndpoint && discovery.endpoints.length > 0) {
    const firstPost = discovery.endpoints.find(e => e.method === 'POST');
    const target = firstPost ?? discovery.endpoints[0];
    const probeUrl = new URL(target.path, normalizedOrigin).toString();
    probeResult = await probe(probeUrl, normalizedOrigin);
  }

  const allIssues = [
    ...discovery.issues,
    ...(probeResult?.issues ?? []),
  ];

  const errors = allIssues.filter(i => i.severity === 'error').length;
  const warnings = allIssues.filter(i => i.severity === 'warning').length;

  return {
    ok: errors === 0,
    origin: normalizedOrigin,
    discovery,
    probe: probeResult,
    summary: {
      totalIssues: allIssues.length,
      errors,
      warnings,
    },
  };
}
