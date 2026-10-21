'use client';

import { useState } from 'react';
import StarInput from '@/components/StarInput';
import ReasonChips from '@/components/ReasonChips';
import type { StarTier } from '@/lib/tiers';

export type RateTarget = {
  title: string;
  type: 'TV' | 'Movie';
  stars: string | null;
  rewatchable: boolean | null;
  notes: string | null;
  extent: string | null;
  onShelf: boolean;
  origin: 'shelf' | 'watchlist' | 'slate';
  // Whatever TMDB resolution the row already carries. It is never resolved here — the
  // sheet only forwards an id the offline TMDB matcher already paid an API call for, so that rating
  // a queued title does not throw it away on the way to the shelf.
  tmdb_id: number | null;
};

/** Half steps from a numeric(2,1) string, without ever making it a float we keep. */
function toHalfSteps(stars: string | null): number {
  return stars === null ? 0 : Math.round(Number(stars) * 2);
}

/**
 * The single write surface. Shelf, watchlist and rec cards all open this
 * one component, so there is exactly one place a rating can be authored and exactly one
 * shape it stages in.
 *
 * Nothing written here is authoritative. Every submit lands in pending_actions
 * attributed to the signed-in account, and reaches the spreadsheet only when
 * the sync script replays it through the spreadsheet's writer.
 */
export default function RateSheet({
  target,
  map,
  onSaved,
  onCancel,
}: {
  target: RateTarget;
  map: StarTier[];
  onSaved: (patch: {
    stars: string | null;
    rewatchable: boolean | null;
    notes: string | null;
    extent: string | null;
  }) => void;
  onCancel: () => void;
}) {
  const [half, setHalf] = useState(toHalfSteps(target.stars));
  const [rewatch, setRewatch] = useState<boolean | null>(target.rewatchable);
  const [notes, setNotes] = useState(target.notes ?? '');
  const [extent, setExtent] = useState(target.extent ?? '');
  const [reasons, setReasons] = useState<string[]>([]);
  const [bailing, setBailing] = useState(false);
  const [marker, setMarker] = useState('');
  // TV only, and null until tapped. Null is a skipped question, never a recorded "no".
  const [likedBefore, setLikedBefore] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stars = half > 0 ? map[half - 1].stars : null;
  // "Low" is T3 and below — the band where a reason is worth one tap at capture time.
  const low = half > 0 && half <= 6;

  function toggle(r: string) {
    setReasons((s) => (s.includes(r) ? s.filter((x) => x !== r) : [...s, r]));
  }

  /** Three states, because absence is unrecorded and never "no". */
  function cycleRewatch() {
    setRewatch((r) => (r === null ? true : r === true ? false : null));
  }

  const rewatchLabel =
    rewatch === null ? 'Rewatchable: not recorded' : rewatch ? 'Rewatchable: yes' : 'Rewatchable: no';

  async function post(url: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `${res.status}`);
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitRating() {
    if (half === 0) {
      setError('Drag the stars to a rating, or use Bailed if it was abandoned.');
      return;
    }
    const ok = await post('/api/rate', {
      title: target.title,
      type: target.type,
      stars,
      rewatchable: rewatch,
      notes: notes.trim() || null,
      reasons: low ? reasons : [],
      extent: extent.trim(),
      origin: target.origin,
      tmdb_id: target.tmdb_id,
    });
    if (ok) {
      onSaved({
        stars,
        rewatchable: rewatch,
        notes: notes.trim() || null,
        extent: extent.trim() || null,
      });
    }
  }

  async function submitBail() {
    const ok = await post('/api/dnf', {
      title: target.title,
      type: target.type,
      marker: marker.trim() || null,
      reasons,
      likedBeforeBail: target.type === 'TV' ? likedBefore : null,
      origin: target.origin,
    });
    if (ok) onCancel();
  }

  if (bailing) {
    return (
      <div className="ratesheet">
        <h3 className="sheet-title">Bailed on {target.title}</h3>
        {/* Abandonment is evidence, not a grade. Saying so here is the whole point of
            keeping it a separate control rather than a zero-star rating. */}
        <p className="faint">
          Staged as a DNF event for the evidence store. This never becomes a row in
          the spreadsheet — abandoning something is high-signal evidence, not a rating.
        </p>

        <label className="field">
          <span className="field-label">Where did you stop?</span>
          <input
            className="input"
            value={marker}
            onChange={(e) => setMarker(e.target.value)}
            placeholder={target.type === 'TV' ? 'e.g. S1E3' : 'e.g. 40 min'}
          />
        </label>

        {/* TV only. A film that lost him lost him; a series can be good and then turn,
            and that distinction is the whole reason a DNF is worth capturing at all. */}
        {target.type === 'TV' && (
          <fieldset className="chips">
            <legend className="chips-legend">Was it ever good? (optional)</legend>
            <button
              type="button"
              className={`chip ${likedBefore === true ? 'chip-on' : ''}`}
              aria-pressed={likedBefore === true}
              onClick={() => setLikedBefore((v) => (v === true ? null : true))}
            >
              It was good, then it wasn&rsquo;t
            </button>
            <button
              type="button"
              className={`chip ${likedBefore === false ? 'chip-on' : ''}`}
              aria-pressed={likedBefore === false}
              onClick={() => setLikedBefore((v) => (v === false ? null : false))}
            >
              It never hooked me
            </button>
          </fieldset>
        )}

        <ReasonChips selected={reasons} onToggle={toggle} label="Why? (optional)" />

        {error && <p className="error">{error}</p>}

        <div className="sheet-actions">
          <button type="button" className="btn-quiet" onClick={() => setBailing(false)} disabled={busy}>
            Back
          </button>
          <button type="button" className="btn-primary" onClick={submitBail} disabled={busy}>
            {busy ? 'Staging…' : 'Stage DNF'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ratesheet">
      <h3 className="sheet-title">{target.title}</h3>
      <p className="faint">
        {target.type}
        {target.onShelf ? ' · already on the shelf' : ' · new to the shelf'}
      </p>

      <StarInput value={half} onChange={setHalf} map={map} />

      <button
        type="button"
        className={`toggle ${rewatch === true ? 'toggle-on' : ''} ${rewatch === false ? 'toggle-off' : ''}`}
        onClick={cycleRewatch}
        aria-pressed={rewatch === true}
      >
        <span className="heart">♥</span> {rewatchLabel}
      </button>

      <label className="field">
        <span className="field-label">Notes</span>
        <textarea
          className="input"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What it was actually like"
        />
      </label>

      {/* Blank means "all of it", which is the overwhelmingly common case and therefore
          the one that costs nothing to record. A value makes the rating legible as
          covering only that much — the Lanterns case, where a provisional T1 at one
          episode used to be prose inside the notes that nothing could act on. */}
      <label className="field">
        <span className="field-label">How much have you seen? (optional)</span>
        <input
          className="input"
          value={extent}
          onChange={(e) => setExtent(e.target.value)}
          placeholder={target.type === 'TV' ? 'blank = all of it, or e.g. S1E1' : 'blank = the whole film'}
        />
      </label>

      {low && <ReasonChips selected={reasons} onToggle={toggle} label="What held it back? (optional)" />}

      {error && <p className="error">{error}</p>}

      <div className="sheet-actions">
        <button type="button" className="btn-quiet" onClick={() => setBailing(true)} disabled={busy}>
          Bailed
        </button>
        <button type="button" className="btn-primary" onClick={submitRating} disabled={busy}>
          {busy ? 'Staging…' : target.onShelf ? 'Update rating' : 'Log it'}
        </button>
      </div>
    </div>
  );
}
