'use client';

import { useRef } from 'react';
import type { StarTier } from '@/lib/tiers';

/**
 * The half-star control.
 *
 * Pointer input is handled against the star track's own box, and the native range is kept
 * purely for the keyboard and the screen reader. That split exists because a range does
 * two things wrong for this control, and only one of them is a layout mistake:
 *
 *   1. Its hit area is its element box. Stretched across the sheet, 5.0 sat at the far
 *      right of the row rather than at the right edge of the fifth star, so rating meant
 *      tapping well outside the stars. Sizing the box to the track fixes that much.
 *   2. A range maps position to value by ROUNDING, which puts each value's hit zone
 *      centred on its own tick. The left half of the first star would read as 0 (unrated)
 *      and the true ends would each be a half-width sliver. Tapping a star has to give
 *      that star.
 *
 * So position maps by ceiling instead: the left half of star k gives k−0.5, the right half
 * gives k, and every point on the track lands on the star under the finger. Clearing a
 * rating is then its own deliberate control rather than a sliver at the left edge, which
 * is the right shape anyway — unrated is a real state, not a zero.
 */
export default function StarInput({
  value,
  onChange,
  map,
}: {
  value: number; // 0-10 half steps; 0 = unrated
  onChange: (v: number) => void;
  map: StarTier[];
}) {
  const track = useRef<HTMLDivElement>(null);
  const pct = (value / 10) * 100;
  const entry = value > 0 ? map[value - 1] : null;

  function valueAt(clientX: number): number {
    const el = track.current;
    if (!el) return value;
    const r = el.getBoundingClientRect();
    const ratio = (clientX - r.left) / r.width;
    // Ceiling, clamped to [1,10]: never 0, because a tap is a rating and clearing is not.
    return Math.min(10, Math.max(1, Math.ceil(ratio * 10)));
  }

  return (
    <div className="starinput">
      <div
        ref={track}
        className="starinput-control"
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          onChange(valueAt(e.clientX));
        }}
        onPointerMove={(e) => {
          // Only while dragging. buttons is 0 for a hover with no button held.
          if (e.buttons > 0) onChange(valueAt(e.clientX));
        }}
      >
        <span className="stars-track stars-lg">
          <span aria-hidden="true" className="stars-empty">
            ★★★★★
          </span>
          <span aria-hidden="true" className="stars-fill" style={{ width: `${pct}%` }}>
            ★★★★★
          </span>
        </span>
        <input
          className="starinput-range"
          type="range"
          min={0}
          max={10}
          step={1}
          value={value}
          aria-label="Rating in half stars"
          aria-valuetext={entry ? `${entry.stars} stars, ${entry.tier_label}` : 'Unrated'}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>

      {/* The bucket is feedback, never input — so it is announced, not offered. */}
      <p className="starinput-readout" aria-live="polite">
        {entry ? (
          <>
            <span className="starinput-value">{entry.stars}</span>
            <span className="tier-label"> · {entry.tier_label}</span>
          </>
        ) : (
          <span className="tier-label">Unrated — tap a star</span>
        )}
      </p>

      {/* Always in the layout, hidden until there is something to clear. Rendering it
          conditionally grew the sheet on the first tap, and because the sheet is anchored
          to the bottom of the screen it grows upward — the stars slid out from under the
          finger exactly when someone was adjusting 4.5 to 5.0. visibility keeps the space
          reserved while taking the button out of the accessibility tree. */}
      <button
        type="button"
        className={`btn-quiet starinput-clear ${value > 0 ? '' : 'is-hidden'}`}
        onClick={() => onChange(0)}
      >
        Clear rating
      </button>
    </div>
  );
}
