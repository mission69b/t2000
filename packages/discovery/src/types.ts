export interface PaymentInfo {
  pricingMode?: string;
  price?: string;
  amount?: string;
  currency?: string;
  protocols?: string[];
  intent?: string;
  method?: string;
  description?: string;
}

export interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  tags?: string[];
  'x-payment-info'?: PaymentInfo;
  requestBody?: Record<string, unknown>;
  responses?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OpenApiPath {
  [method: string]: OpenApiOperation;
}

export interface OpenApiDocument {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
    'x-guidance'?: string;
    [key: string]: unknown;
  };
  'x-discovery'?: {
    ownershipProofs?: string[];
    [key: string]: unknown;
  };
  'x-service-info'?: Record<string, unknown>;
  paths: Record<string, OpenApiPath>;
  [key: string]: unknown;
}

export interface DiscoveredEndpoint {
  path: string;
  method: string;
  operationId?: string;
  summary?: string;
  paymentInfo: PaymentInfo;
  hasRequestBody: boolean;
  has402Response: boolean;
}

export type Severity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  code: string;
  severity: Severity;
  message: string;
  path?: string;
  method?: string;
}

export interface DiscoverResult {
  ok: boolean;
  origin: string;
  specUrl: string;
  title: string;
  version: string;
  guidance?: string;
  endpoints: DiscoveredEndpoint[];
  totalEndpoints: number;
  paidEndpoints: number;
  issues: ValidationIssue[];
}

export interface ProbeResult {
  ok: boolean;
  url: string;
  statusCode: number;
  hasSuiPayment: boolean;
  recipient?: string;
  currency?: string;
  amount?: string;
  realm?: string;
  issues: ValidationIssue[];
}

export interface CheckResult {
  ok: boolean;
  origin: string;
  discovery: DiscoverResult;
  probe?: ProbeResult;
  summary: {
    totalIssues: number;
    errors: number;
    warnings: number;
  };
}
