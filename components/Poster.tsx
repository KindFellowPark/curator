/**
 * Artwork, with a designed fallback rather than a broken one.
 *
 * Most titles now carry a cached TMDB poster and render it. The rest — a title TMDB has
 * no art for, and any whose match is still waiting on a human check — keep the original
 * tinted block: a stable hue from the title itself, same block every render and every
 * device. That block is deliberately a tinted field with initials and not a fake poster,
 * because nothing here should read as artwork that failed to load.
 *
 * No credential is involved. image.tmdb.org is unauthenticated, so the browser fetches
 * artwork directly and the TMDB key never leaves the server.
 */
import { posterUrl, POSTER_GRID } from '@/lib/tmdb';

const TINTS = [
  'var(--surf-4)',
  'var(--surf-5)',
  'var(--surf-6)',
  'var(--spruce)',
  'var(--graphite)',
  'var(--surf-3)',
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function initials(title: string): string {
  // Leading articles and leading numerals are both dropped, because neither identifies
  // anything: "10 Things I Hate About You" as "1T" and "21 Jump Street" as "2J" read as
  // rendering bugs rather than as initials.
  const words = title
    .split(/\s+/)
    .filter((w) => /[a-z]/i.test(w))
    .filter((w, i) => !(i === 0 && /^(the|a|an)$/i.test(w)));
  return (words.length ? words : title.split(/\s+/))
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export default function Poster({
  title,
  type,
  posterPath,
  size = POSTER_GRID,
}: {
  title: string;
  type: 'TV' | 'Movie';
  posterPath?: string | null;
  size?: string;
}) {
  const src = posterUrl(posterPath, size);
  if (src) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element -- next/image would proxy
         every poster through the deployment for no gain: these are already CDN-hosted
         at the exact width we ask for. */
      <img
        className="poster poster-art"
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    <div className="poster" style={{ background: TINTS[hash(title) % TINTS.length] }} aria-hidden="true">
      <span className="poster-initials">{initials(title)}</span>
      <span className="poster-type">{type}</span>
    </div>
  );
}
