import { services } from '@/lib/services';
import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json(services, {
    headers: {
      'cache-control': 'public, max-age=60',
      'access-control-allow-origin': '*',
    },
  });
}
