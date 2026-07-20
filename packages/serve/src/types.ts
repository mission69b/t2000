import type { DigestStore } from '@suimpp/mpp/server';

/** Sui network the seller settles on. */
export type ServeNetwork = 'mainnet' | 'testnet';

export interface ServeConfig {
  /** The seller's Sui address — every payment settles here. Required. */
  payTo: string;
  /** Defaults to 'mainnet'. */
  network?: ServeNetwork;
  /**
   * Public base URL of the deployed app (e.g. https://api.example.com).
   * Used for the `resource` field in 402 challenges and discovery docs.
   * When omitted, the per-request URL origin is used.
   */
  baseUrl?: string;
  /**
   * Replay/challenge store. Defaults to an in-memory store — fine for a
   * single long-lived process, NOT for serverless (each instance gets its
   * own memory). Pass an UpstashDigestStore (or any DigestStore) in
   * production on serverless hosts.
   */
  store?: DigestStore;
  /** Human-readable service name (discovery docs, slice 2). */
  name?: string;
  /** One-line description (discovery docs, slice 2). */
  description?: string;
  /**
   * Report settled payments to the t2 activity feed (mpp.t2000.ai).
   * Fire-and-forget, never blocks or fails a response. Default true.
   */
  report?: boolean;
  /** Override the Sui fullnode gRPC URL (default: mainnet/testnet fullnode). */
  rpcUrl?: string;
}

/**
 * Minimal validation contract. Accepts anything implementing
 * Standard Schema v1 (zod v4, valibot, arktype…) or exposing a
 * zod-style `safeParse`. serve has no schema dependency of its own.
 */
export type ServeSchema<T = unknown> =
  | StandardSchemaLike<T>
  | SafeParseSchemaLike<T>;

export interface StandardSchemaLike<T = unknown> {
  '~standard': {
    version: 1;
    validate: (
      value: unknown,
    ) =>
      | StandardSchemaResult<T>
      | Promise<StandardSchemaResult<T>>;
  };
}

export type StandardSchemaResult<T> =
  | { value: T; issues?: undefined }
  | {
      issues: ReadonlyArray<{
        message: string;
        /** Standard Schema path segments (plain keys or `{ key }` objects). */
        path?: ReadonlyArray<PropertyKey | { key: PropertyKey }>;
      }>;
    };

export interface SafeParseSchemaLike<T = unknown> {
  safeParse: (value: unknown) =>
    | { success: true; data: T }
    | { success: false; error: { message?: string } };
}

/** What a paid handler receives. */
export interface HandlerContext<TBody = unknown> {
  /** The validated request body (undefined when no .body() schema was set). */
  body: TBody;
  /** The original Request. */
  req: Request;
  /**
   * The buyer's Sui address from the structurally-verified payment payload.
   * Undefined on unprotected (free) routes.
   */
  payer?: string;
}

/** Handlers may return a Response directly or any JSON-serializable value. */
export type HandlerResult = Response | unknown;

export interface RouteMeta {
  path: string;
  /** Human-units USDC price string, e.g. "0.01". Undefined = free route. */
  priceUsdc?: string;
  description?: string;
  /** The runtime validation schema. */
  bodySchema?: ServeSchema;
  /**
   * JSON Schema of the request body, emitted into /openapi.json + /llms.txt
   * so buyers' agents can build request bodies without guessing (a wrong
   * guess against a direct seller is a paid error). zod v4:
   * `z.toJSONSchema(schema)`.
   */
  inputSchema?: Record<string, unknown>;
}

/** The built route — a fetch-compatible handler plus its metadata. */
export type BuiltRoute = ((req: Request) => Promise<Response>) & {
  meta: RouteMeta;
};
