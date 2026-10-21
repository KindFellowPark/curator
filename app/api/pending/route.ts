import { NextResponse } from 'next/server';
import { currentActor } from '@/auth';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

const KINDS = ['log', 'want', 'rerate', 'verdict', 'dnf', 'question_answer'] as const;
type Kind = (typeof KINDS)[number];

/**
 * The staging surface. Nothing written here is authoritative: the sync script
 * replays these rows through the spreadsheet's writer, its only writer.
 *
 * The actor is taken from the signed-in session and never from the request body. A
 * client-supplied actor would make attribution a claim rather than a fact, and
 * attribution is the one thing the workbook cannot reconstruct after the fact.
 *
 * Stars are passed through untouched. This app does not derive tier — `tier_from_stars()`
 * in the database is the single implementation of the stars-to-tier mapping, and a second one in
 * TypeScript is exactly the drift the constraint exists to prevent.
 */
export async function GET() {
  if (!(await currentActor())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const q = sql();
  const rows = await q`
    SELECT id::text, kind, title, payload, actor, created_at
    FROM pending_actions
    WHERE consumed_at IS NULL
    ORDER BY created_at ASC
  `;
  return NextResponse.json({ rows, count: rows.length });
}

export async function POST(req: Request) {
  const actor = await currentActor();
  if (!actor) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'body must be JSON' }, { status: 400 });
  }

  const { kind, title, payload } = (body ?? {}) as {
    kind?: string;
    title?: string | null;
    payload?: unknown;
  };

  if (!kind || !KINDS.includes(kind as Kind)) {
    return NextResponse.json(
      { error: `kind must be one of ${KINDS.join(', ')}` },
      { status: 400 },
    );
  }
  if (payload !== undefined && (typeof payload !== 'object' || payload === null || Array.isArray(payload))) {
    return NextResponse.json({ error: 'payload must be a JSON object' }, { status: 400 });
  }

  const q = sql();
  const [row] = await q`
    INSERT INTO pending_actions (kind, title, payload, actor)
    VALUES (${kind}, ${title ?? null}, ${JSON.stringify(payload ?? {})}::jsonb, ${actor})
    RETURNING id::text, kind, title, actor, created_at
  `;
  return NextResponse.json({ row }, { status: 201 });
}
