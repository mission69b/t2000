// The one HTTP helper for the commerce write rail — every API failure
// becomes a `T2000Error` carrying the server's own sentence (the CLI,
// Connect, and host apps print it verbatim). Browser-safe: fetch only.

import { T2000Error, type T2000ErrorCode } from '../errors.js';

export const DEFAULT_COMMERCE_API_BASE = 'https://api.t2000.ai/v1';

/** HTTP status → the closest SDK error code. */
function codeForStatus(status: number): T2000ErrorCode {
  if (status === 400 || status === 409 || status === 422) {
    return 'INVALID_INPUT';
  }
  if (status === 429 || status >= 500) {
    return 'RPC_ERROR';
  }
  return 'UNKNOWN';
}

/** The API's error message — `error` is a string or `{ message }`. */
export function apiErrorMessage(
  json: Record<string, unknown>,
  status: number,
): string {
  const err = json.error;
  if (typeof err === 'string') {
    return err;
  }
  const msg = (err as { message?: unknown } | undefined)?.message;
  return typeof msg === 'string' ? msg : `HTTP ${status}`;
}

export interface ApiResponse {
  ok: boolean;
  status: number;
  json: Record<string, unknown>;
}

/** Raw request — the caller decides how a non-2xx maps (endpoint prepare
 *  carries per-route findings the plain message would hide). */
export async function apiRequest(
  url: string,
  init?: { method?: string; body?: unknown },
): Promise<ApiResponse> {
  const res = await fetch(url, {
    method: init?.method ?? (init?.body === undefined ? 'GET' : 'POST'),
    headers: {
      accept: 'application/json',
      ...(init?.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, json };
}

/** Request + throw `T2000Error(<api message>)` on a non-2xx. */
export async function apiJson(
  url: string,
  init?: { method?: string; body?: unknown },
): Promise<Record<string, unknown>> {
  const res = await apiRequest(url, init);
  if (!res.ok) {
    throw new T2000Error(codeForStatus(res.status), apiErrorMessage(res.json, res.status), {
      status: res.status,
      ...(res.json.error && typeof res.json.error === 'object'
        ? { api: res.json.error }
        : {}),
    });
  }
  return res.json;
}

export function invalidInput(message: string): T2000Error {
  return new T2000Error('INVALID_INPUT', message);
}
