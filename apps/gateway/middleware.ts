import { type NextRequest, NextResponse } from 'next/server';
import { services } from '@/lib/services';

const serviceMap = new Map(services.map((s) => [s.id, s]));

const SKIP = /^\/(api|_next|logos|llms\.txt|favicon\.ico)/;

export function middleware(request: NextRequest) {
  if (request.method !== 'GET') return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (SKIP.test(pathname) || pathname === '/') return NextResponse.next();

  const segments = pathname.split('/').filter(Boolean);
  const service = serviceMap.get(segments[0]);
  if (!service) return NextResponse.next();

  if (segments.length === 1) {
    return NextResponse.json({
      service: service.name,
      url: service.serviceUrl,
      description: service.description,
      chain: service.chain,
      currency: service.currency,
      endpoints: service.endpoints.map((ep) => ({
        method: ep.method,
        url: `${service.serviceUrl}${ep.path}`,
        description: ep.description,
        price: `${ep.price} USDC`,
      })),
      protocol: 'MPP (Machine-Payable Protocol)',
      how_to_use: 'POST to any endpoint. Pay the 402 challenge with Sui USDC. Receive the API response.',
      docs: 'https://mpp.t2000.ai',
    });
  }

  const subPath = '/' + segments.slice(1).join('/');
  const endpoint = service.endpoints.find((ep) => ep.path === subPath);

  if (endpoint) {
    return NextResponse.json({
      service: service.name,
      method: endpoint.method,
      url: `${service.serviceUrl}${endpoint.path}`,
      description: endpoint.description,
      price: `${endpoint.price} USDC`,
      how_to_use: `Send a ${endpoint.method} request to this URL. You will receive a 402 payment challenge. Pay with Sui USDC to get the response.`,
      example: `t2000 pay ${service.serviceUrl}${endpoint.path} --data '{...}'`,
      docs: 'https://mpp.t2000.ai',
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
};
