'use client';

import { useEffect, useRef, useState } from 'react';
import Poster from '@/components/Poster';
import Sheet from '@/components/Sheet';
import RateSheet, { type RateTarget } from '@/components/RateSheet';
import type { WatchlistRow } from '@/lib/db';
import type { StarTier } from '@/lib/tiers';
import { posterUrl, type SearchHit } from '@/lib/tmdb';

export default function WatchlistView({ initial, map }: { initial: WatchlistRow[]; map: StarTier[] }) {
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [type, setType] = useState<'TV' | 'Movie'>('Movie');
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);

  // TMDB autocomplete. `picked` is what the user chose from the list; typing again
  // clears it, so a stale poster can never ride along with an edited title.
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [picked, setPicked] = useState<SearchHit | null>(null);
  const [searchErr, setSearchErr] = useState<string | null>(null);

  // Debounced because this fires per keystroke against a rate-limited third party, and
  // an aborted controller because out-of-order responses would otherwise let an earlier,
  // shorter query overwrite the list for a longer one typed after it.
  useEffect(() => {
    if (picked || title.trim().length < 2) {
      setHits([]);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(title.trim())}&type=${type}`,
          { signal: ctl.signal },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'search failed');
        setHits(data.hits ?? []);
        setSearchErr(null);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        // Non-fatal by design: free-text entry still works, so the form degrades to what
        // it was before autocomplete existed rather than blocking the add.
        setHits([]);
        setSearchErr('Search is unavailable — type the title and add it anyway.');
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [title, type, picked]);

  const listRef = useRef<HTMLUListElement>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const drag = useRef<{ startY: number; slots: number[]; from: number } | null>(null);
  const [offset, setOffset] = useState(0);

  const selected = open ? (items.find((i) => i.title === open) ?? null) : null;

  async function persist(order: string[]) {
    setError(null);
    const res = await fetch('/api/watchlist/rank', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ order }),
    });
    if (!res.ok) setError('Could not save the new order.');
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= items.length || to === from) return;
    const next = [...items];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    setItems(next);
    void persist(next.map((r) => r.title));
  }

  // --- drag reorder -------------------------------------------------------------
  // Pointer events rather than HTML5 drag-and-drop, which does not fire on touch at all
  // — and this is a phone-first surface. The up/down buttons stay the primary path: they
  // are keyboard-reachable and they work when a drag is fiddly on a moving couch.

  function onHandleDown(e: React.PointerEvent, i: number) {
    const ul = listRef.current;
    if (!ul) return;
    const slots = Array.from(ul.children).map((c) => (c as HTMLElement).getBoundingClientRect().top);
    drag.current = { startY: e.clientY, slots, from: i };
    setDragIdx(i);
    setOffset(0);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onHandleMove(e: React.PointerEvent) {
    const d = drag.current;
    if (d === null || dragIdx === null) return;
    e.preventDefault();
    setOffset(e.clientY - d.startY);

    // Slot tops were captured before any reordering, so they describe fixed positions on
    // screen. Find which one the finger is now in and move the row there.
    let target = d.slots.length - 1;
    for (let j = 0; j < d.slots.length; j++) {
      const bottom = j + 1 < d.slots.length ? d.slots[j + 1] : Infinity;
      if (e.clientY < bottom) {
        target = j;
        break;
      }
    }
    if (target !== dragIdx) {
      const next = [...items];
      const [row] = next.splice(dragIdx, 1);
      next.splice(target, 0, row);
      setItems(next);
      // Keep the dragged card under the finger after the list shifts beneath it.
      d.startY += d.slots[target] - d.slots[dragIdx];
      setOffset(e.clientY - d.startY);
      setDragIdx(target);
    }
  }

  function onHandleUp() {
    if (dragIdx !== null) void persist(items.map((r) => r.title));
    drag.current = null;
    setDragIdx(null);
    setOffset(0);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          type,
          source: source.trim() || null,
          // The chosen hit's catalogue facts, staged rather than merely displayed. Free
          // text sends nulls and stays legal.
          tmdb_id: picked?.tmdb_id ?? null,
          year: picked?.year ?? null,
          poster_path: picked?.poster_path ?? null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `${res.status}`);
      setItems((s) => [
        ...s,
        {
          title: title.trim(),
          type,
          source: source.trim() || null,
          added: new Date().toISOString().slice(0, 10),
          notes: null,
          rank: s.length + 1,
          // From the autocomplete hit when there was one. These are now persisted by
          // the endpoint as well as shown here, so the poster survives a reload. When they
          // were display-only, which made the artwork appear on add and
          // silently vanish on the next fetch.
          tmdb_id: picked?.tmdb_id ?? null,
          poster_path: picked?.poster_path ?? null,
        },
      ]);
      setTitle('');
      setSource('');
      setPicked(null);
      setHits([]);
      setAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="strip">
        {items.length} queued · drag or use ↑↓ to reorder
      </div>

      {!adding && (
        <button type="button" className="btn-primary add-btn" onClick={() => setAdding(true)}>
          + Add
        </button>
      )}

      {adding && (
        <form className="addform" onSubmit={add}>
          {/* TMDB autocomplete. Picking a hit contributes its catalogue facts too —
              id, year and poster — because a hit the user picked by eye is a better
              resolution than the deterministic matcher can make from a bare string.
              Free text stays legal for anything TMDB has never heard of. */}
          <label className="field">
            <span className="field-label">Title</span>
            <input
              className="input"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setPicked(null);
              }}
              placeholder="What do you want to watch?"
              autoComplete="off"
              autoFocus
            />
          </label>

          {hits.length > 0 && (
            <ul className="suggest">
              {hits.map((h) => (
                <li key={h.tmdb_id}>
                  <button
                    type="button"
                    className="suggest-row"
                    onClick={() => {
                      setTitle(h.title);
                      setType(h.type);
                      setPicked(h);
                      setHits([]);
                    }}
                  >
                    {posterUrl(h.poster_path, 'w92') ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img className="suggest-art" src={posterUrl(h.poster_path, 'w92')!} alt="" />
                    ) : (
                      <span className="suggest-art suggest-art-blank" aria-hidden="true" />
                    )}
                    <span className="suggest-title">{h.title}</span>
                    <span className="suggest-year">{h.year ?? '—'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {searchErr && <p className="hint">{searchErr}</p>}

          <div className="seg" role="group" aria-label="Type">
            {(['Movie', 'TV'] as const).map((t) => (
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

          <label className="field">
            <span className="field-label">Where it came from (optional)</span>
            <input
              className="input"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="a friend, a trailer, a list"
            />
          </label>

          {error && <p className="error">{error}</p>}

          <div className="sheet-actions">
            <button type="button" className="btn-quiet" onClick={() => { setAdding(false); setError(null); }}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Staging…' : 'Add'}
            </button>
          </div>
        </form>
      )}

      {error && !adding && <p className="error">{error}</p>}

      {items.length === 0 && <p className="empty">Nothing queued yet.</p>}

      <ul className="cards" ref={listRef}>
        {items.map((r, i) => (
          <li
            key={r.title}
            className={`card ${dragIdx === i ? 'card-dragging' : ''}`}
            style={dragIdx === i ? { transform: `translateY(${offset}px)` } : undefined}
          >
            <span className="card-rank">{i + 1}</span>

            <button type="button" className="card-body" onClick={() => setOpen(r.title)}>
              <span className="card-poster">
                <Poster title={r.title} type={r.type} posterPath={r.poster_path} />
              </span>
              <span className="card-text">
                <span className="row-title">{r.title}</span>
                <span className="tier-label">
                  {r.type}
                  {r.source ? ` · ${r.source}` : ''}
                </span>
                {r.notes && <span className="faint">{r.notes}</span>}
              </span>
            </button>

            <span className="card-controls">
              <button
                type="button"
                className="btn-icon"
                aria-label={`Move ${r.title} up`}
                disabled={i === 0}
                onClick={() => move(i, i - 1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn-icon"
                aria-label={`Move ${r.title} down`}
                disabled={i === items.length - 1}
                onClick={() => move(i, i + 1)}
              >
                ↓
              </button>
              <span
                className="btn-icon grip"
                role="presentation"
                onPointerDown={(e) => onHandleDown(e, i)}
                onPointerMove={onHandleMove}
                onPointerUp={onHandleUp}
                onPointerCancel={onHandleUp}
              >
                ⠿
              </span>
            </span>
          </li>
        ))}
      </ul>

      <Sheet open={selected !== null} onClose={() => setOpen(null)} title="Rate">
        {selected && (
          <RateSheet
            map={map}
            target={
              {
                title: selected.title,
                type: selected.type,
                stars: null,
                rewatchable: null,
                notes: selected.notes,
                // Nothing has been seen yet, so there is no extent to carry in — but the
                // field is offered, because "I watched one episode and it is a 4.5" is
                // exactly how a queued title most often leaves the queue.
                extent: null,
                onShelf: false,
                origin: 'watchlist',
                tmdb_id: selected.tmdb_id,
              } satisfies RateTarget
            }
            onCancel={() => setOpen(null)}
            onSaved={() => {
              // Rated, so it has moved to the shelf — the endpoint deleted the row.
              setItems((s) => s.filter((x) => x.title !== selected.title));
              setOpen(null);
            }}
          />
        )}
      </Sheet>
    </>
  );
}
