# @mppsui/discovery

Sui-specific discovery validation for [MPP](https://mpp.dev) servers. Validate OpenAPI documents, check `x-payment-info` extensions, and probe 402 payment challenges.

[![npm](https://img.shields.io/npm/v/@mppsui/discovery)](https://www.npmjs.com/package/@mppsui/discovery)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

## CLI

```bash
# Full validation — OpenAPI + live 402 probe
npx @mppsui/discovery check mpp.t2000.ai

# List paid endpoints only
npx @mppsui/discovery discover mpp.t2000.ai

# Machine-readable JSON
npx @mppsui/discovery check mpp.t2000.ai --json
```

### Example output

```
t2000 MPP Gateway v1.0.0
https://mpp.t2000.ai/openapi.json

  Endpoints: 88 total, 88 paid

  POST   /openai/v1/chat/completions  $0.01
  POST   /openai/v1/embeddings        $0.001
  ...

  Discovery
  ✓ OpenAPI valid

  Probe https://mpp.t2000.ai/openai/v1/chat/completions
  ✓ 402 with Sui payment challenge
    Recipient: 0x...
    Currency:  0xdba...::usdc::USDC
    Realm:     mpp.t2000.ai

  ✓ All checks passed
```

## Programmatic Usage

```typescript
import { check, discover, probe } from '@mppsui/discovery';

// Full validation
const result = await check('mpp.t2000.ai');
console.log(result.ok);              // true
console.log(result.summary.errors);  // 0

// Discovery only (no probe)
const disc = await discover('mpp.t2000.ai');
for (const ep of disc.endpoints) {
  console.log(ep.method, ep.path, ep.paymentInfo.price);
}

// Probe a specific endpoint
const probeResult = await probe(
  'https://mpp.t2000.ai/openai/v1/chat/completions',
  'https://mpp.t2000.ai',
);
console.log(probeResult.hasSuiPayment); // true
console.log(probeResult.recipient);     // 0x...
```

## What it validates

### OpenAPI checks
- OpenAPI 3.1.x version
- `x-payment-info` on paid operations
- `protocols` includes `"mpp"`
- `402` response defined
- `requestBody` on POST/PUT/PATCH
- Price format for fixed pricing
- `x-guidance` or `x-service-info` present
- Route count warning (>80)

### Probe checks (Sui-specific)
- Server returns 402 Payment Required
- Payment challenge extractable (body or `WWW-Authenticate` header)
- Recipient is a valid Sui address (`0x...`)
- Currency is recognized Sui USDC type
- Realm matches the server's public domain

## Validation codes

| Code | Severity | Description |
|------|----------|-------------|
| `OPENAPI_FETCH_FAILED` | error | Could not fetch `/openapi.json` |
| `OPENAPI_VERSION_INVALID` | error | Not OpenAPI 3.1.x |
| `NO_PAID_ENDPOINTS` | error | No operations with `x-payment-info` |
| `MISSING_402_RESPONSE` | error | Paid operation missing 402 response |
| `MISSING_REQUEST_BODY` | warning | POST/PUT/PATCH without requestBody |
| `MISSING_PROTOCOLS` | warning | No protocols field in x-payment-info |
| `PROTOCOL_NOT_MPP` | error | protocols does not include "mpp" |
| `MISSING_PRICING` | error | Fixed pricing with no price |
| `HIGH_ROUTE_COUNT` | warning | >80 paid routes |
| `PROBE_NOT_402` | error | Endpoint did not return 402 |
| `PROBE_INVALID_RECIPIENT` | error | Not a valid Sui address |
| `PROBE_UNKNOWN_CURRENCY` | warning | Unrecognized Sui token type |
| `PROBE_REALM_MISMATCH` | error | Realm doesn't match origin |

## Testing

```bash
pnpm --filter @mppsui/discovery test       # 19 tests
pnpm --filter @mppsui/discovery typecheck
```

## License

MIT
