import { NextResponse } from 'next/server';
import { currentActor } from '@/auth';
import { searchTitles } from '@/lib/tmdb';

export const dynamic = 'force-dynamic';

/**
 * TMDB search for the Add flow. Behind the allowlist like every other route — an
 * unauthenticated version of this would be an open TMDB proxy running on our key.
 */
export async function GET(req: Request) {
  if (!(await currentActor())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const type = url.searchParams.get('type') === 'TV' ? 'TV' : 'Movie';
  if (q.length < 2) return NextResponse.json({ hits: [] });

  try {
    return NextResponse.json({ hits: await searchTitles(q, type) });
  } catch (err) {
    // Surfaced rather than swallowed: the likely cause is a missing TMDB_API_KEY on the
    // deployment, and a silent empty list would read as "no such title".
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
