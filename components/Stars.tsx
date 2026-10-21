/**
 * Read-only star display, exact to the half step.
 *
 * The fill is a clipped overlay rather than a per-star glyph choice, so 4.5 is drawn as
 * 90% of the track and never rounded to a nearest whole glyph. `stars` stays a string
 * the whole way from numeric(2,1): a float round-trip is the one way a half step stops
 * being exact.
 */
export default function Stars({ stars, size }: { stars: string | null; size?: 'sm' | 'md' }) {
  if (stars === null) {
    return <span className="stars-unrated">Unrated</span>;
  }
  const pct = (Number(stars) / 5) * 100;
  return (
    <span className={`stars-track ${size === 'md' ? 'stars-md' : ''}`} aria-label={`${stars} stars`}>
      <span aria-hidden="true" className="stars-empty">
        ★★★★★
      </span>
      <span aria-hidden="true" className="stars-fill" style={{ width: `${pct}%` }}>
        ★★★★★
      </span>
    </span>
  );
}
