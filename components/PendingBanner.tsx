import { sql } from '@/lib/db';

/**
 * The staleness model, made visible.
 *
 * Everything the couch does is staged, and nothing reaches the spreadsheet until someone
 * runs the sync. That gap is a real property of the design, not a bug to hide, so
 * the count of unstaged-to-unsynced changes sits in the chrome rather than being
 * discoverable only by someone who already knew to look.
 *
 * The design places this on For you; it lives in the shell instead, because the staleness
 * it reports is true on all three tabs and a rating staged from Shelf is exactly the
 * change most worth surfacing.
 */
export default async function PendingBanner() {
  let count = 0;
  let synced: string | null = null;

  try {
    const q = sql();
    const [row] = (await q`
      SELECT (SELECT count(*) FROM pending_actions WHERE consumed_at IS NULL) AS pending,
             (SELECT max(synced_at) FROM shelf) AS synced
    `) as { pending: string; synced: string | null }[];
    count = Number(row?.pending ?? 0);
    synced = row?.synced ?? null;
  } catch {
    // A banner that cannot read the database is not worth an error state of its own —
    // the page beneath it reports the failure with the detail that actually helps.
    return null;
  }

  if (count === 0) return null;

  const when = synced
    ? new Date(synced).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : 'never';

  return (
    <div className="pending-banner" role="status">
      {count} change{count === 1 ? '' : 's'} pending · synced {when}
    </div>
  );
}
