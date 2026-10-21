import WatchlistView from '@/components/WatchlistView';
import { watchlistRows, type WatchlistRow } from '@/lib/db';
import { starTierMap, type StarTier } from '@/lib/tiers';

export const dynamic = 'force-dynamic';

export default async function WatchlistPage() {
  let rows: WatchlistRow[] = [];
  let map: StarTier[] = [];
  let error: string | null = null;

  try {
    const [raw, tiers] = await Promise.all([watchlistRows(), starTierMap()]);
    rows = raw;
    map = tiers;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <>
      <h2 className="page-title">Watchlist</h2>

      {error && (
        <>
          <p className="faint">Could not reach the snapshot.</p>
          <p className="error">{error}</p>
        </>
      )}

      {!error && <WatchlistView initial={rows} map={map} />}
    </>
  );
}
