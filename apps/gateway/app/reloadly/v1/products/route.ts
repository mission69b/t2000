import { chargeCustom, fetchWithRetry } from '@/lib/gateway';
import { getReloadlyToken, RELOADLY_BASE, reloadlyHeaders } from '@/lib/reloadly';

export const POST = chargeCustom('0.005', async (bodyText) => {
  const { countryCode = 'US' } = JSON.parse(bodyText) as { countryCode?: string };
  const token = await getReloadlyToken();

  return fetchWithRetry(
    `${RELOADLY_BASE}/countries/${encodeURIComponent(countryCode)}/products`,
    { method: 'GET', headers: reloadlyHeaders(token) },
  );
});
