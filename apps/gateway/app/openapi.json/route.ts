import { generateOpenApiDocument } from '@/lib/openapi';

let cached: string | null = null;

export function GET() {
  if (!cached) {
    cached = JSON.stringify(generateOpenApiDocument(), null, 2);
  }

  return new Response(cached, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'access-control-allow-origin': '*',
    },
  });
}
