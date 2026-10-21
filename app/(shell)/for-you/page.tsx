import ForYouView from '@/components/ForYouView';
import {
  slateRows,
  promoteSlate,
  bufferedCount,
  nextQuestion,
  LOW_BUFFER,
  type SlateRow,
  type QuestionRow,
} from '@/lib/db';
import { starTierMap, type StarTier } from '@/lib/tiers';

export const dynamic = 'force-dynamic';

/**
 * The slate is generated outside the app and pushed in. No inference runs in this app, so an
 * empty slate is a fact to state plainly, never something to fill by guessing.
 *
 * Promotion runs before the read, not after the push. A slate arrives entirely `buffered`
 * (the column default), so a generator that forgot to mark the first five `shown` would
 * otherwise produce a tab that renders empty against a full buffer — a failure that looks
 * exactly like having no recommendations. Promoting here makes the display self-healing
 * and costs one idempotent UPDATE.
 */
export default async function ForYouPage() {
  let rows: SlateRow[] = [];
  let buffered = 0;
  let question: QuestionRow | null = null;
  let map: StarTier[] = [];
  let error: string | null = null;

  try {
    await promoteSlate();
    const [slate, left, q, tiers] = await Promise.all([
      slateRows(),
      bufferedCount(),
      nextQuestion(),
      starTierMap(),
    ]);
    rows = slate;
    buffered = left;
    question = q;
    map = tiers;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <>
      <h2 className="page-title">For you</h2>

      {error && (
        <>
          <p className="faint">Could not reach the snapshot.</p>
          <p className="error">{error}</p>
        </>
      )}

      {!error && (
        <ForYouView
          initial={rows}
          buffered={buffered}
          lowBuffer={LOW_BUFFER}
          question={question}
          map={map}
        />
      )}
    </>
  );
}
