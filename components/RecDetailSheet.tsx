'use client';

import { useEffect, useState } from 'react';
import Poster from '@/components/Poster';
import RecCard, { type RecItem } from '@/components/RecCard';
import VerdictControls, { type VerdictKind } from '@/components/VerdictControls';
import { POSTER_DETAIL } from '@/lib/tmdb';

/**
 * The rec detail sheet. Its whole job is that the facts and the case do not blur.
 *
 * The design keeps them visually separate, and the reason is epistemic rather than
 * decorative: a badge like "one season, arc closes — verified" is a checked fact about
 * the world, while the rationale is an argument built on profile claims and carries its
 * own caveat. Run together, the argument borrows the fact's authority — which is exactly
 * how a recommender starts sounding certain about taste. They are separate regions with
 * separate headings here so that never happens by layout accident.
 *
 * Everything in both layers is authored outside the app. Nothing on this screen is inferred.
 */
export default function RecDetailSheet({
  item,
  source,
  onVerdict,
  busy,
}: {
  item: RecItem;
  source: 'slate' | 'similar' | 'raw';
  onVerdict: (v: VerdictKind, reasons: string[], target?: RecItem, targetSource?: 'slate' | 'similar' | 'raw') => void;
  busy?: boolean;
}) {
  const [similars, setSimilars] = useState<RecItem[] | null>(null);
  const [curated, setCurated] = useState<boolean>(true);
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    let live = true;
    setSimilars(null);
    const url =
      `/api/similars?anchor=${encodeURIComponent(item.title)}` +
      `&type=${item.type}${item.tmdb_id ? `&tmdb_id=${item.tmdb_id}` : ''}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : { rows: [], curated: true, requested: false }))
      .then((d) => {
        if (!live) return;
        setSimilars(d.rows ?? []);
        setCurated(d.curated !== false);
        setRequested(Boolean(d.requested));
      })
      .catch(() => live && setSimilars([]));
    return () => {
      live = false;
    };
  }, [item.title, item.type, item.tmdb_id]);

  return (
    <div className="rec-detail">
      <div className="detail-head">
        <Poster title={item.title} type={item.type} posterPath={item.poster_path} size={POSTER_DETAIL} />
        <div>
          <h3 className="sheet-title">{item.title}</h3>
          <p className="faint">
            {item.type}
            {item.year ? ` · ${item.year}` : ''}
          </p>
        </div>
      </div>

      {/* ---- FACTS LAYER. Checked things. No argument lives in this region. ---- */}
      <section className="facts-layer" aria-label="Facts">
        <h4 className="layer-heading">The facts</h4>
        {item.badges && item.badges.length > 0 && (
          <ul className="badges">
            {item.badges.map((b) => (
              <li key={b} className="badge">
                {b}
              </li>
            ))}
          </ul>
        )}
        {item.synopsis ? (
          <p className="synopsis">{item.synopsis}</p>
        ) : (
          <p className="faint">No synopsis cached for this title yet.</p>
        )}
      </section>

      {/* ---- CASE LAYER. The argument, and its caveat, clearly labelled as such. ---- */}
      <section className="case-layer" aria-label="The case">
        <h4 className="layer-heading">The case</h4>
        {item.rationale ? (
          <p className="rationale">{item.rationale}</p>
        ) : item.why ? (
          <p className="rationale">{item.why}</p>
        ) : (
          <p className="faint">No case was written for this one.</p>
        )}
      </section>

      <section className="similars-layer" aria-label="If you liked this">
        <h4 className="layer-heading">If you liked this</h4>

        {similars === null && <p className="faint">Looking…</p>}

        {similars !== null && !curated && similars.length > 0 && (
          <p className="faint">
            Straight from TMDB&rsquo;s catalogue, not chosen for you
            {requested ? ' — a curation request is staged' : ''}.
          </p>
        )}

        {similars !== null && similars.length === 0 && (
          <p className="faint">
            Nothing curated for this one yet
            {requested ? ' — a request is staged' : ''}.
          </p>
        )}

        {similars?.map((s) => (
          <RecCard
            key={s.id}
            item={s}
            busy={busy}
            onVerdict={(v, rs) => onVerdict(v, rs, s, curated ? 'similar' : 'raw')}
          />
        ))}
      </section>

      {/* Controls only. The poster, title, year and case are all above; a card here
          would render the same title twice on one screen. */}
      <section aria-label="Your verdict">
        <h4 className="layer-heading">Your call</h4>
        <VerdictControls busy={busy} onVerdict={(v, rs) => onVerdict(v, rs, item, source)} />
      </section>
    </div>
  );
}
