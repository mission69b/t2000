import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/lib/generated/prisma/client';

/**
 * GET /api/user/preferences?address=0x...
 *
 * Returns user preferences for the given Sui address.
 */
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address');

  if (!address || !address.startsWith('0x')) {
    return NextResponse.json({ error: 'Missing or invalid address' }, { status: 400 });
  }

  const prefs = await prisma.userPreferences.findUnique({
    where: { address },
  });

  if (!prefs) {
    return NextResponse.json({ contacts: [], limits: null });
  }

  return NextResponse.json({
    contacts: prefs.contacts,
    limits: prefs.limits,
  });
}

/**
 * POST /api/user/preferences
 *
 * Upserts user preferences for a Sui address.
 * Body: { address: string, contacts?: Contact[], limits?: object }
 */
export async function POST(request: NextRequest) {
  let body: { address?: string; contacts?: unknown; limits?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { address, contacts, limits } = body;

  if (!address || typeof address !== 'string' || !address.startsWith('0x')) {
    return NextResponse.json({ error: 'Missing or invalid address' }, { status: 400 });
  }

  const update: Prisma.UserPreferencesUpdateInput = {};
  if (contacts !== undefined) update.contacts = contacts as Prisma.InputJsonValue;
  if (limits !== undefined) update.limits = limits as Prisma.InputJsonValue;

  const prefs = await prisma.userPreferences.upsert({
    where: { address },
    create: {
      address,
      contacts: (contacts ?? []) as Prisma.InputJsonValue,
      limits: limits as Prisma.InputJsonValue | undefined,
    },
    update,
  });

  return NextResponse.json({
    contacts: prefs.contacts,
    limits: prefs.limits,
  });
}
