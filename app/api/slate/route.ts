import { NextResponse } from 'next/server';
import { currentActor } from '@/auth';
import { slateRows } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Snapshot read of the recommendation buffer. The slate is generated outside the app and
 * pushed in; this app displays it and never infers one. `predicted_stars` is
 * deliberately not selected — it is calibration data, hidden from the v1 UI.
 */
export async function GET() {
  if (!(await currentActor())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const rows = await slateRows();
  return NextResponse.json({ rows, count: rows.length });
}
