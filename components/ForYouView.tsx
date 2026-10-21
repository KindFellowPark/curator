'use client';

import { useState } from 'react';
import Sheet from '@/components/Sheet';
import RecCard, { type RecItem } from '@/components/RecCard';
import type { VerdictKind } from '@/components/VerdictControls';
import RecDetailSheet from '@/components/RecDetailSheet';
import QuestionCard, { type Question } from '@/components/QuestionCard';
import RateSheet, { type RateTarget } from '@/components/RateSheet';
import type { StarTier } from '@/lib/tiers';

type Src = 'slate' | 'similar' | 'raw';

/**
 * The For-you tab.
 *
 * Cards leave the list the moment a verdict lands, without waiting for a refetch. That is
 * the same optimism /api/rate uses and it is safe for the same reason: the slate's
 * shown set is a read model the server rebuilds by promotion, so a card removed here and
 * contradicted there is simply replaced on the next load.
 *
 * A `seen it` is two staged rows and one gesture. The verdict records that a rec found an
 * unlogged title near the household's taste — the sheet-gap signal, which is the whole reason the
 * verdict exists — and the rate sheet that opens behind it stages the rating. Collapsing
 * them into one would keep the rating and lose the signal.
 */
export default function ForYouView({
  initial,
  buffered,
  lowBuffer,
  question,
  map,
}: {
  initial: RecItem[];
  buffered: number;
  lowBuffer: number;
  question: Question | null;
  map: StarTier[];
}) {
  const [rows, setRows] = useState<RecItem[]>(initial);
  const [q, setQ] = useState<Question | null>(question);
  const [open, setOpen] = useState<RecItem | null>(null);
  const [rating, setRating] = useState<RecItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verdict(v: VerdictKind, reasons: string[], item: RecItem, source: Src) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/verdict', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          source,
          verdict: v,
          reasons,
          // Only a raw catalogue row needs these: it has no database row to read them
          // from. Sent unconditionally would invite the server to trust them.
          ...(source === 'raw' ? { title: item.title, type: item.type } : {}),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `${res.status}`);
      }

      // Only a slate card occupies a slot. A similar or raw card lives inside a sheet and
      // is not consumed by a verdict on it.
      if (source === 'slate') setRows((s) => s.filter((r) => r.id !== item.id));
      setOpen(null);

      if (v === 'seen_it') setRating(item);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {q && (
        <QuestionCard
          q={q}
          onDone={() => setQ(null)}
        />
      )}

      {error && <p className="error">{error}</p>}

      {rows.length === 0 && (
        <p className="empty">
          Nothing on the slate right now. Recommendations are generated outside the app and
          pushed here.
        </p>
      )}

      {rows.map((r) => (
        <RecCard
          key={r.id}
          item={r}
          busy={busy}
          onOpen={() => setOpen(r)}
          onVerdict={(v, rs) => verdict(v, rs, r, 'slate')}
        />
      ))}

      {/* Stated plainly rather than hidden, because the fix is an offline run generating
          more, and someone has to start it. A slate that thins silently just stops. */}
      {buffered <= lowBuffer && rows.length > 0 && (
        <p className="faint slate-low">
          Slate running low — {buffered} left in the buffer.
        </p>
      )}

      <Sheet open={open !== null} onClose={() => setOpen(null)} title="Recommendation">
        {open && (
          <RecDetailSheet
            item={open}
            source="slate"
            busy={busy}
            onVerdict={(v, rs, target, targetSource) =>
              verdict(v, rs, target ?? open, targetSource ?? 'slate')
            }
          />
        )}
      </Sheet>

      <Sheet open={rating !== null} onClose={() => setRating(null)} title="Rate">
        {rating && (
          <RateSheet
            map={map}
            target={
              {
                title: rating.title,
                type: rating.type,
                stars: null,
                rewatchable: null,
                notes: null,
                extent: null,
                onShelf: false,
                origin: 'slate',
                tmdb_id: rating.tmdb_id,
              } satisfies RateTarget
            }
            onCancel={() => setRating(null)}
            onSaved={() => setRating(null)}
          />
        )}
      </Sheet>
    </>
  );
}
