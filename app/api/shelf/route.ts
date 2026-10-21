import { NextResponse } from 'next/server';
import { currentActor } from '@/auth';
import { shelfRows } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Snapshot read. The shelf is a projection of the spreadsheet and is never written here. */
export async function GET() {
  if (!(await currentActor())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const rows = await shelfRows();
  return NextResponse.json({ rows, count: rows.length });
}
