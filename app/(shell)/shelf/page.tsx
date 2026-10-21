import ShelfView from '@/components/ShelfView';
import { shelfRows, type ShelfRow } from '@/lib/db';
import { starTierMap, type StarTier } from '@/lib/tiers';

export const dynamic = 'force-dynamic';

/**
 * The shelf reads whole. 238 titles is small enough that paging would cost more than it
 * saves, and filtering client-side keeps every chip instant on a phone — which is the
 * only place this is ever used.
 */
export default async function ShelfPage() {
  let rows: ShelfRow[] = [];
  let map: StarTier[] = [];
  let error: string | null = null;

  try {
    const [raw, tiers] = await Promise.all([shelfRows(), starTierMap()]);
    rows = raw;
    map = tiers;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <>
      <h2 className="page-title">Shelf</h2>

      {error && (
        <>
          <p className="faint">Could not reach the snapshot.</p>
          <p className="error">{error}</p>
        </>
      )}

      {!error && rows.length === 0 && (
        <p className="empty">
          The snapshot is empty. It fills when the sync script pushes the spreadsheet in.
        </p>
      )}

      {!error && rows.length > 0 && <ShelfView initial={rows} map={map} />}
    </>
  );
}
