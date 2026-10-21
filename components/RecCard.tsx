'use client';

import Poster from '@/components/Poster';
import VerdictControls, { type VerdictKind } from '@/components/VerdictControls';

export type { VerdictKind };

export type RecItem = {
  id: string;
  title: string;
  type: 'TV' | 'Movie';
  why?: string | null;
  rationale?: string | null;
  badges?: string[] | null;
  curated?: boolean;
  tmdb_id: number | null;
  poster_path: string | null;
  year: number | null;
  synopsis: string | null;
};

/**
 * One recommendation, wherever it appears. The design specifies the same component for
 * slate cards and similar cards, so this takes its verdict handler from the caller rather
 * than being written twice — two copies would drift on exactly the part that must not,
 * which is the verdict set.
 */
export default function RecCard({
  item,
  onVerdict,
  onOpen,
  busy,
}: {
  item: RecItem;
  onVerdict: (v: VerdictKind, reasons: string[]) => void;
  onOpen?: () => void;
  busy?: boolean;
}) {
  return (
    <article className="rec-card">
      <button
        type="button"
        className="rec-main"
        onClick={onOpen}
        disabled={!onOpen}
        aria-label={onOpen ? `Details for ${item.title}` : undefined}
      >
        <Poster title={item.title} type={item.type} posterPath={item.poster_path} />
        <span className="rec-text">
          <span className="rec-title">{item.title}</span>
          <span className="faint">
            {item.type}
            {item.year ? ` · ${item.year}` : ''}
            {/* An uncurated row says so on the card, not only in the sheet. The whole
                risk of showing raw catalogue output is that it reads as chosen. */}
            {item.curated === false && ' · not curated'}
          </span>
          {item.why && <span className="rec-why">{item.why}</span>}
        </span>
      </button>

      <VerdictControls onVerdict={onVerdict} busy={busy} />
    </article>
  );
}
