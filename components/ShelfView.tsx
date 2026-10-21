'use client';

import { useMemo, useState } from 'react';
import Poster from '@/components/Poster';
import { POSTER_DETAIL } from '@/lib/tmdb';
import Stars from '@/components/Stars';
import Sheet from '@/components/Sheet';
import RateSheet, { type RateTarget } from '@/components/RateSheet';
import type { ShelfRow } from '@/lib/db';
import type { StarTier } from '@/lib/tiers';
import { comparator, SORTS, type SortKey } from '@/lib/sort';

type TypeFilter = 'All' | 'TV' | 'Movie';

/** Thresholds sit on the tier boundaries, so "3.5+" means T1-T2 and nothing else. */
const THRESHOLDS = [
  { label: 'Any', min: 0 },
  { label: '3.5+', min: 3.5 },
  { label: '4.5+', min: 4.5 },
];

export default function ShelfView({ initial, map }: { initial: ShelfRow[]; map: StarTier[] }) {
  const [rows, setRows] = useState(initial);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<TypeFilter>('All');
  const [min, setMin] = useState(0);
  const [heartOnly, setHeartOnly] = useState(false);
  const [unratedOnly, setUnratedOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('tierAsc');
  const [open, setOpen] = useState<string | null>(null);
  const [rating, setRating] = useState(false);

  // Corpus-level, not filtered: this strip is the state of the collection, and a count
  // that moved every time a chip was tapped would be a different, less useful fact.
  const stats = useMemo(() => {
    const rated = rows.filter((r) => r.stars !== null).length;
    return {
      total: rows.length,
      rated,
      unrated: rows.length - rated,
      hearts: rows.filter((r) => r.rewatchable === true).length,
    };
  }, [rows]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const kept = rows.filter((r) => {
      if (q && !r.title.toLowerCase().includes(q)) return false;
      if (type !== 'All' && r.type !== type) return false;
      if (unratedOnly && r.stars !== null) return false;
      // A threshold is a claim about a rating, so an unrated row cannot satisfy one.
      if (min > 0 && (r.stars === null || Number(r.stars) < min)) return false;
      // NULL is unrecorded, never "no" — so this filters to recorded-yes only.
      if (heartOnly && r.rewatchable !== true) return false;
      return true;
    });

    // `kept` is already a fresh array, so sorting in place never touches `rows`.
    return kept.sort(comparator(sort));
  }, [rows, query, type, min, heartOnly, unratedOnly, sort]);

  /**
   * Browsing and backfilling want opposite orders. The shelf leads with what the household loves;
   * the Unrated pass wants the low and middle tiers first, where a half step still
   * discriminates and where DNFs sit encoded as T4. So the mode carries the default and
   * re-sets it on every toggle — one statable rule — while the control stays visible so
   * a tap overrides it for as long as the mode is held.
   */
  function toggleUnrated() {
    const next = !unratedOnly;
    setUnratedOnly(next);
    setSort(next ? 'tierDesc' : 'tierAsc');
  }

  const selected = open ? (rows.find((r) => r.title === open) ?? null) : null;

  function patch(
    title: string,
    p: { stars: string | null; rewatchable: boolean | null; notes: string | null; extent: string | null },
  ) {
    setRows((rs) =>
      rs.map((r) => {
        if (r.title !== title) return r;
        // Tier is derived server-side and comes back on the next load. Reading the label
        // out of the map the server sent keeps the card honest in the meantime without
        // the client ever computing a tier.
        const entry = p.stars === null ? null : map.find((m) => m.stars === p.stars);
        return {
          ...r,
          stars: p.stars,
          rewatchable: p.rewatchable,
          notes: p.notes,
          extent: p.extent,
          tier: entry ? entry.tier : r.tier,
          tier_label: entry ? entry.tier_label : r.tier_label,
        };
      }),
    );
  }

  return (
    <>
      <div className="strip">
        {stats.total} titles · {stats.rated} rated · {stats.unrated} unrated · {stats.hearts} ♥
      </div>

      <input
        className="input search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search titles"
        aria-label="Search titles"
      />

      <div className="filters">
        <div className="seg" role="group" aria-label="Type">
          {(['All', 'TV', 'Movie'] as TypeFilter[]).map((t) => (
            <button
              key={t}
              type="button"
              className={`seg-btn ${type === t ? 'seg-on' : ''}`}
              aria-pressed={type === t}
              onClick={() => setType(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="seg" role="group" aria-label="Minimum rating">
          {THRESHOLDS.map((t) => (
            <button
              key={t.label}
              type="button"
              className={`seg-btn ${min === t.min ? 'seg-on' : ''}`}
              aria-pressed={min === t.min}
              onClick={() => setMin(t.min)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={`chip ${heartOnly ? 'chip-on' : ''}`}
          aria-pressed={heartOnly}
          onClick={() => setHeartOnly((v) => !v)}
        >
          ♥ Rewatchable
        </button>

        {/* The self-serve backfill path: older titles can carry tier only, and this is
            how one of them gets found and rated without anyone opening the workbook. */}
        <button
          type="button"
          className={`chip ${unratedOnly ? 'chip-on' : ''}`}
          aria-pressed={unratedOnly}
          onClick={toggleUnrated}
        >
          Unrated
        </button>

        <div className="seg" role="group" aria-label="Sort">
          {SORTS.map((o) => (
            <button
              key={o.key}
              type="button"
              className={`seg-btn ${sort === o.key ? 'seg-on' : ''}`}
              aria-pressed={sort === o.key}
              onClick={() => setSort(o.key)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <p className="faint result-count">
        {shown.length === stats.total ? 'Showing everything' : `${shown.length} of ${stats.total}`}
      </p>

      {shown.length === 0 && <p className="empty">Nothing matches those filters.</p>}

      <ul className="grid">
        {shown.map((r) => (
          <li key={r.title}>
            <button type="button" className="tile" onClick={() => setOpen(r.title)}>
              <Poster title={r.title} type={r.type} posterPath={r.poster_path} />
              <span className="tile-title">{r.title}</span>
              <span className="tile-meta">
                {r.rewatchable === true && <span className="heart">♥ </span>}
                {r.stars === null ? (
                  <span className="stars-unrated">Unrated</span>
                ) : (
                  <Stars stars={r.stars} />
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Sheet open={selected !== null} onClose={() => { setOpen(null); setRating(false); }} title="Title detail">
        {selected && !rating && (
          <div className="detail">
            <div className="detail-head">
              <div className="detail-poster">
                <Poster title={selected.title} type={selected.type}
                        posterPath={selected.poster_path} size={POSTER_DETAIL} />
              </div>
              <div>
                <h3 className="sheet-title">{selected.title}</h3>
                <p className="faint">
                  {selected.type} · {selected.tier_label}
                  {selected.extent && ` · ${selected.extent} only`}
                </p>
                <p className="detail-stars">
                  <Stars stars={selected.stars} size="md" />
                </p>
                {selected.rewatchable === true && <p className="heart">♥ Rewatchable</p>}
                {selected.rewatchable === false && <p className="faint">Not a rewatch</p>}
              </div>
            </div>

            {selected.notes && <p className="detail-notes">{selected.notes}</p>}

            <div className="sheet-actions">
              <button type="button" className="btn-quiet" onClick={() => setOpen(null)}>
                Close
              </button>
              <button type="button" className="btn-primary" onClick={() => setRating(true)}>
                {selected.stars === null ? 'Rate it' : 'Change rating'}
              </button>
            </div>
          </div>
        )}

        {selected && rating && (
          <RateSheet
            map={map}
            target={
              {
                title: selected.title,
                type: selected.type,
                stars: selected.stars,
                rewatchable: selected.rewatchable,
                notes: selected.notes,
                extent: selected.extent,
                onShelf: true,
                origin: 'shelf',
                tmdb_id: selected.tmdb_id,
              } satisfies RateTarget
            }
            onCancel={() => setRating(false)}
            onSaved={(p) => {
              patch(selected.title, p);
              setRating(false);
              setOpen(null);
            }}
          />
        )}
      </Sheet>
    </>
  );
}
