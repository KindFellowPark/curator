import { NextResponse } from 'next/server';
import { currentActor } from '@/auth';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Answer or skip the one question on offer.
 *
 * A SKIP IS RECORDED AND RESPECTED. It is not a deferral — the queue is ranked by
 * information value, so the top question is the one worth asking, and re-offering a
 * skipped one would spend the single quiet slot this surface has on something already
 * declined. `skipped` is set and `nextQuestion()` excludes it permanently.
 *
 * An answer stages with the question text and its provenance carried in the payload, not
 * merely the row id: the evidence store is append-only and outlives the queue, so a
 * record that pointed at a question_queue row would be a dangling reference the moment
 * the queue is regenerated. Provenance is what the answer is evidence *about*, which is
 * the part synthesis reads.
 */
export async function POST(req: Request) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'body must be JSON' }, { status: 400 });
  }

  const { id, answer, skip } = (body ?? {}) as {
    id?: string;
    answer?: string | null;
    skip?: boolean;
  };

  if (typeof id !== 'string' || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const q = sql();
  const [row] = (await q`
    SELECT question, provenance FROM question_queue WHERE id = ${id}::bigint
  `) as { question: string; provenance: string | null }[];
  if (!row) return NextResponse.json({ error: 'no such question' }, { status: 404 });

  if (skip === true) {
    await q`UPDATE question_queue SET skipped = true, asked_at = coalesce(asked_at, now())
            WHERE id = ${id}::bigint`;
    return NextResponse.json({ staged: 'skip' }, { status: 200 });
  }

  const text = typeof answer === 'string' ? answer.trim() : '';
  if (!text) {
    return NextResponse.json({ error: 'answer is required, or pass skip' }, { status: 400 });
  }

  const payload = JSON.stringify({
    question: row.question,
    provenance: row.provenance,
    answer: text,
    question_id: id,
  });

  await q.transaction([
    q`INSERT INTO pending_actions (kind, title, payload, actor)
      VALUES ('question_answer', ${row.provenance}, ${payload}::jsonb, ${actor})`,
    q`UPDATE question_queue
      SET answered_at = now(), asked_at = coalesce(asked_at, now())
      WHERE id = ${id}::bigint`,
  ]);

  return NextResponse.json({ staged: 'question_answer' }, { status: 201 });
}
